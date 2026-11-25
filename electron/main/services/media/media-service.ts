import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import type {BrowserWindow} from 'electron'
import {getDb,getDataRoot} from '../../database/store'
import {defaultMediaPreferences,mediaPreferencesSchema,mediaPreferencesPatchSchema,type MediaPreferences,type MediaKind,type MediaTask,type MediaSnapshot} from '../../../../src/shared/mediaModels'
import {scanSources,probeMedia,createWorkspace} from './media-files'
import {ffmpegBinaries,engineStatus,validateFfmpeg} from './engines'
import {loadMediaTasks,saveMediaTask} from './task-persistence'
import {executeMediaTask} from './execution'
import {ModelStorage} from './model-storage'
import {simplifySubtitleFile} from './subtitle-simplify'

export class MediaService {
 private tasks:MediaTask[]=[]
 private preferences:MediaPreferences={...defaultMediaPreferences}
 private controllers=new Map<string,AbortController>()
 private executions=new Set<Promise<void>>()
 private simplifyControllers=new Set<AbortController>()
 private simplifyTasks=new Set<Promise<void>>()
 private closing=false
 private exclusive=false
 private adding=false
 private importController:AbortController|undefined
 private importFinished:Promise<void>=Promise.resolve()
 private restartRequired=false
 private eventTimer:ReturnType<typeof setTimeout>|undefined
 readonly models:ModelStorage
 constructor(private window:()=>BrowserWindow|null){
  this.models=new ModelStorage({getPreferences:()=>this.getPreferences(),setDirectory:directory=>this.savePreferences({...this.preferences,modelDirectory:directory}),getRuntimeDirectory:()=>this.runtimeDirectory(),isBusy:()=>this.isBusy(),onChange:()=>this.changed()})
 }
 runtimeDirectory(){return path.join(getDataRoot(),'media-engines')}
 getPreferences(){return{...this.preferences,modelDirectory:this.preferences.modelDirectory||path.join(getDataRoot(),'models','whisper')}}
 private savePreferences(p:MediaPreferences){getDb().prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run('mediaPrefs',JSON.stringify(p));this.preferences=p;this.changed()}
 async initialize(){
  const row=getDb().prepare("SELECT value_json FROM settings WHERE key='mediaPrefs'").get()
  if(row)try{this.preferences=mediaPreferencesSchema.parse(JSON.parse(String(row.value_json)))}catch{/* 无效设置使用默认值。 */}
  this.tasks=loadMediaTasks(getDb());for(const t of this.tasks){
   if(t.temporaryPath&&t.options){const directory=t.options.outputDirectory||path.dirname(t.inputPath),name=path.basename(t.temporaryPath);if(path.dirname(t.temporaryPath)===directory&&name.startsWith('.tooldock-media-'+t.id+'.')&&/^\.tooldock-media-[0-9a-f-]{36}\.(mp3|wav|flac|m4a|srt|ogg|ac3|eac3|dts)$/.test(name)){const stat=await fs.lstat(t.temporaryPath).catch(()=>null);if(stat?.isFile()&&!stat.isSymbolicLink())await fs.unlink(t.temporaryPath).catch(()=>{})}t.temporaryPath=undefined}
   saveMediaTask(getDb(),t)
  }
  // 只清理本服务专属缓存目录中的 UUID 工作目录，不碰未知路径。
  const cache=path.join(getDataRoot(),'media-cache');await fs.mkdir(cache,{recursive:true})
  for(const entry of await fs.readdir(cache,{withFileTypes:true})){if(entry.isDirectory()&&/^[0-9a-f-]{36}$/.test(entry.name))await fs.rm(path.join(cache,entry.name),{recursive:true,force:true})}
 }
 changed(){if(this.eventTimer)return;this.eventTimer=setTimeout(()=>{this.eventTimer=undefined;const win=this.window();if(win&&!win.isDestroyed())win.webContents.send('media:changed')},200)}
 isBusy(){return this.closing||this.restartRequired||this.exclusive||this.adding||this.controllers.size>0||this.simplifyTasks.size>0||this.tasks.some(t=>t.state==='queued')}
 assertIdle(){if(this.closing)throw Error('ToolDock 正在退出');if(this.isBusy())throw Error('请先停止媒体任务及目录操作')}
 async dataMutation<T>(fn:()=>T|Promise<T>):Promise<T>{this.assertIdle();if(this.models.isBusy())throw Error('请先暂停模型下载及引擎安装');this.exclusive=true;try{const result=await fn();if(result&&typeof result==='object'&&'restartRequired' in result&&result.restartRequired)this.restartRequired=true;return result}finally{this.exclusive=false}}
 private assertAvailable(){if(this.closing||this.exclusive||this.restartRequired)throw Error(this.restartRequired?'数据目录已变更，请重启 ToolDock 后继续':'媒体服务正在退出或执行数据目录操作')}
 /** 面向工作台的轻量只读数据；不扫描/哈希模型文件，不包含任何文件路径。 */
 dashboardState(){
  return {tasks:this.tasks.map(t=>({id:t.id,kind:t.kind,name:t.name,state:t.state,percent:t.percent,createdAt:t.createdAt,updatedAt:t.updatedAt,error:t.error})),downloads:this.models.downloads()}
 }
 async status():Promise<MediaSnapshot>{return{tasks:this.tasks.map(t=>({...t,probe:{...t.probe,audioTracks:t.probe.audioTracks.map(a=>({...a}))}})),preferences:this.getPreferences(),models:await this.models.list(),downloads:this.models.downloads(),engines:await engineStatus(this.runtimeDirectory()),busy:this.isBusy()||this.models.isBusy()}}
 getTask(id:string){const t=this.tasks.find(t=>t.id===id);if(!t)throw Error('任务不存在');return t}
 async setPreferences(input:Partial<MediaPreferences>){this.assertAvailable();const patch=mediaPreferencesPatchSchema.parse(input);if(patch.modelDirectory!==undefined||(patch.ffmpegOverride!==undefined&&patch.ffmpegOverride!==''))throw Error('请使用专用目录或程序选择器');if(patch.ffmpegOverride==='')this.assertIdle();const p=mediaPreferencesSchema.parse({...this.preferences,...patch});if(p.outputDirectory&&!path.isAbsolute(p.outputDirectory))throw Error('输出目录必须为绝对路径');this.savePreferences(p)}
 async setFfmpegOverride(file:string){return this.dataMutation(async()=>{this.savePreferences({...this.preferences,ffmpegOverride:await validateFfmpeg(file)})})}
 async addSources(inputs:string[],kind:MediaKind){
  this.assertAvailable();if(this.adding)throw Error('文件正在导入，请稍候');this.adding=true;const controller=new AbortController();this.importController=controller;let finishImport!:()=>void;this.importFinished=new Promise(resolve=>{finishImport=resolve})
  try{const binaries=await ffmpegBinaries(this.preferences.ffmpegOverride),result=await scanSources(inputs,kind);let added=0
   const existing=new Set(this.tasks.filter(t=>t.kind===kind&&['ready','queued','running'].includes(t.state)).map(t=>t.inputPath.toLowerCase()))
   for(const file of result.files){if(this.closing)break;if(existing.has(file.toLowerCase())){result.skipped.push({path:file,reason:'文件已在队列中'});continue}if(this.tasks.filter(t=>['ready','queued','running'].includes(t.state)).length>=1000){result.skipped.push({path:file,reason:'队列最多1000个未完成任务'});continue}
    try{const probe=await probeMedia(binaries.ffprobe,file,controller.signal);if(controller.signal.aborted)break;if(!probe.audioTracks.length)throw Error('没有可用音轨');if(kind==='extract'&&!probe.hasVideo)throw Error('音频提取仅接受视频');const now=Date.now(),task:MediaTask={id:randomUUID(),kind,inputPath:file,name:path.basename(file),probe,audioIndex:probe.audioTracks[0].index,state:'ready',percent:0,outputPath:'',error:'',device:'',fallbackReason:'',createdAt:now,updatedAt:now,attempts:0};this.tasks.unshift(task);this.persist(task);existing.add(file.toLowerCase());added++}catch(e){result.skipped.push({path:file,reason:e instanceof Error?e.message:'媒体探测失败'})}
   }this.changed();return{added,skipped:result.skipped.slice(0,1000)}
  }finally{this.adding=false;this.importController=undefined;finishImport()}
 }
 async start(ids:string[],preferences:MediaPreferences){
  this.assertAvailable();if(this.models.isBusy())throw Error('请先完成或暂停模型下载及目录操作');const options=mediaPreferencesSchema.parse(preferences)
  if(options.ffmpegOverride!==this.getPreferences().ffmpegOverride||options.modelDirectory!==this.getPreferences().modelDirectory)throw Error('程序和模型目录只能通过专用选择器修改')
  if(options.outputDirectory&&!path.isAbsolute(options.outputDirectory))throw Error('输出目录必须为绝对路径')
  for(const id of ids){const task=this.getTask(id);if(!['ready','failed','cancelled','interrupted'].includes(task.state))continue;task.options={...options};task.state='queued';task.percent=0;task.error='';task.device='';task.fallbackReason='';task.finishedAt=undefined;this.persist(task)}this.pump();this.changed()
 }
 async retry(id:string){const task=this.getTask(id);await this.start([id],task.options??this.getPreferences())}
 async setAudioTrack(id:string,index:number){this.assertAvailable();const t=this.getTask(id);if(['queued','running'].includes(t.state))throw Error('运行中的任务不能更改音轨');if(!t.probe.audioTracks.some(a=>a.index===index))throw Error('音轨不存在');t.audioIndex=index;this.persist(t);this.changed()}
 private persist(t:MediaTask){t.updatedAt=Date.now();saveMediaTask(getDb(),t)}
 private pump(){if(this.closing||this.exclusive)return;for(const kind of ['extract','subtitle'] as const){let count=this.tasks.filter(t=>t.kind===kind&&t.state==='running').length;const limit=kind==='extract'?2:1;for(const task of this.tasks.slice().reverse()){if(count>=limit)break;if(task.kind!==kind||task.state!=='queued')continue;count++;task.state='running';task.attempts++;const controller=new AbortController();this.controllers.set(task.id,controller);this.persist(task);const execution=this.execute(task,controller);this.executions.add(execution);void execution.finally(()=>{this.executions.delete(execution);this.pump()})}}}
 private async execute(task:MediaTask,controller:AbortController){
  const workspace=path.join(getDataRoot(),'media-cache',task.id);let saved=0
  try{await createWorkspace(path.dirname(workspace),task.id);await executeMediaTask(task,controller.signal,this.runtimeDirectory(),workspace,id=>this.models.resolveModel(id),()=>{const now=Date.now();if(now-saved>1000){this.persist(task);saved=now}this.changed()});task.state='completed';task.percent=100}
  catch(e){task.state=controller.signal.aborted?'cancelled':'failed';task.error=e instanceof Error?e.message:'媒体任务失败'}
  finally{task.finishedAt=Date.now();this.controllers.delete(task.id);await fs.rm(workspace,{recursive:true,force:true}).catch(()=>{});this.persist(task);this.trim();this.changed()}
 }
 private trim(){const terminal=this.tasks.filter(t=>['completed','failed','cancelled','interrupted'].includes(t.state)).slice(100);const ids=new Set(terminal.map(t=>t.id));this.tasks=this.tasks.filter(t=>!ids.has(t.id))}
 async cancel(id:string){this.assertAvailable();const t=this.getTask(id);const controller=this.controllers.get(id);if(controller)controller.abort();else if(['ready','queued'].includes(t.state)){t.state='cancelled';t.finishedAt=Date.now();this.persist(t)}this.changed()}
 async clearFinished(){this.assertAvailable();const states=['completed','failed','cancelled','interrupted'];this.tasks=this.tasks.filter(t=>!states.includes(t.state));getDb().prepare("DELETE FROM media_tasks WHERE state IN ('completed','failed','cancelled','interrupted')").run();this.changed()}
 async preview(id:string){const t=this.getTask(id);if(t.kind!=='subtitle'||t.state!=='completed'||!t.outputPath)throw Error('字幕尚未完成');const stat=await fs.stat(t.outputPath);if(stat.size>16*1024*1024)throw Error('字幕预览超过16MiB');return fs.readFile(t.outputPath,'utf8')}
 async simplifySubtitle(id:string):Promise<string>{
  this.assertAvailable()
  const t=this.getTask(id)
  if(t.kind!=='subtitle'||t.state!=='completed'||!t.outputPath)throw Error('字幕尚未完成')
  const controller=new AbortController()
  this.simplifyControllers.add(controller)
  const job=simplifySubtitleFile(t.outputPath,[t.inputPath,t.outputPath],path.join(getDataRoot(),'media-cache'),controller.signal)
  const tracked=job.then(()=>undefined,()=>undefined)
  this.simplifyTasks.add(tracked)
  try{return await job}
  finally{this.simplifyControllers.delete(controller);this.simplifyTasks.delete(tracked)}
 }
 async shutdown(){this.closing=true;this.importController?.abort();for(const task of this.tasks.filter(t=>t.state==='queued')){task.state='interrupted';task.finishedAt=Date.now();this.persist(task)}for(const controller of this.controllers.values())controller.abort();for(const controller of this.simplifyControllers)controller.abort();await Promise.allSettled([...this.executions,...this.simplifyTasks,this.models.shutdown(),this.importFinished]);if(this.eventTimer)clearTimeout(this.eventTimer)}
}
