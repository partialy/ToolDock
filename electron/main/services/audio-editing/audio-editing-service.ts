import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import type {BrowserWindow} from 'electron'
import {getDb,getDataRoot} from '../../database/store'
import {scanSources} from '../media/media-files'
import {audioEditSchema,audioExportOptionsSchema,canonicalKept,hasCuts,type AudioProject,type AudioEdit,type AudioExportJob,type AudioExportOptions,type AudioPreferences,type AudioStatus} from '../../../../src/shared/audioEditingModels'
import {assertSourceUnchanged,getProjectStream,probeAudioSource,validAudioBaseName} from './audio-source'
import {audioExtension,validateAudioExport} from './audio-filtergraph'
import {renderAudioExport} from './audio-export-service'
import {AudioPreviewService} from './audio-preview-service'

const defaults:AudioPreferences={cacheLimitBytes:2*1024**3,outputDirectory:''}
export class AudioEditingService{
 private projects:AudioProject[]=[]
 private jobs:AudioExportJob[]=[]
 private controllers=new Map<string,AbortController>()
 private active=new Set<Promise<void>>()
 private adding=false
 private exclusive=false
 private closing=false
 private eventTimer:ReturnType<typeof setTimeout>|undefined
 readonly previewer=new AudioPreviewService(()=>getDataRoot())
 private preferences:AudioPreferences={...defaults}
 constructor(private window:()=>BrowserWindow|null){}
 changed(){
  if(this.eventTimer)return
  this.eventTimer=setTimeout(()=>{this.eventTimer=undefined;const w=this.window();if(w&&!w.isDestroyed())w.webContents.send('audio:changed')},200)
 }
 async initialize(){
  const row=getDb().prepare("SELECT value_json FROM settings WHERE key='audioEditPrefs'").get() as {value_json:string}|undefined
  if(row)try{const prefs=JSON.parse(row.value_json) as AudioPreferences;if(prefs.cacheLimitBytes>=128*1024**2&&prefs.cacheLimitBytes<=20*1024**3&&typeof prefs.outputDirectory==='string')this.preferences=prefs}catch{}
  this.projects=(getDb().prepare('SELECT project_json FROM audio_projects ORDER BY last_opened_at DESC').all() as {project_json:string}[]).flatMap(r=>{try{return [JSON.parse(r.project_json) as AudioProject]}catch{return[]}})
  this.jobs=(getDb().prepare('SELECT job_json FROM audio_export_jobs ORDER BY created_at DESC LIMIT 300').all() as {job_json:string}[]).flatMap(r=>{try{return [JSON.parse(r.job_json) as AudioExportJob]}catch{return[]}})
  for(const job of this.jobs)if(job.state==='queued'||job.state==='running'){job.state='interrupted';job.error='上次导出已中断，请手动重试';job.finishedAt=Date.now();this.persistJob(job)}
  await this.previewer.initialize()
 }
 dashboardTasks(){return this.jobs.map(j=>({id:j.id,name:j.projectName,state:j.state,percent:j.percent,createdAt:j.createdAt,updatedAt:j.finishedAt||j.startedAt||j.createdAt,error:j.error}))}
 status():AudioStatus{return{projects:this.projects.map(p=>structuredClone(p)),jobs:this.jobs.map(j=>structuredClone(j)),busy:this.isBusy(),preferences:{...this.preferences}}}
 isBusy(){return this.adding||this.controllers.size>0||this.previewer.isBusy()||this.exclusive||this.closing}
 async dataMutation<T>(fn:()=>Promise<T>|T){
  if(this.isBusy())throw Error('请先停止音频预览和导出任务再操作数据目录')
  this.exclusive=true
  try{return await fn()}finally{this.exclusive=false}
 }
 private assertAvailable(){if(this.closing||this.exclusive)throw Error('音频编辑服务正被占用')}
 private persistProject(p:AudioProject){
  p.updatedAt=Date.now()
  getDb().prepare(`INSERT INTO audio_projects (id,source_key,stream_index,revision,project_json,created_at,updated_at,last_opened_at)
   VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_key=excluded.source_key,stream_index=excluded.stream_index,revision=excluded.revision,project_json=excluded.project_json,updated_at=excluded.updated_at,last_opened_at=excluded.last_opened_at`)
   .run(p.id,p.source.path.toLowerCase(),p.streamIndex,p.revision,JSON.stringify(p),p.createdAt,p.updatedAt,p.lastOpenedAt)
 }
 private persistJob(job:AudioExportJob){
  getDb().prepare(`INSERT INTO audio_export_jobs (id,project_id,state,created_at,finished_at,job_json)
   VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,finished_at=excluded.finished_at,job_json=excluded.job_json`)
   .run(job.id,job.projectId,job.state,job.createdAt,job.finishedAt??null,JSON.stringify(job))
 }
 get(id:string){const p=this.projects.find(x=>x.id===id);if(!p)throw Error('音频工程不存在');return p}
 getJob(id:string){const job=this.jobs.find(x=>x.id===id);if(!job)throw Error('导出任务不存在');return job}
 async addSources(paths:string[]){
  this.assertAvailable();if(this.adding)throw Error('文件正在导入')
  this.adding=true
  const skipped:{path:string;reason:string}[]=[];let added=0,reused=0
  try{
   const scan=await scanSources(paths,'subtitle')
   skipped.push(...scan.skipped)
   for(const file of scan.files){
    try{
     const existing=this.projects.find(p=>p.source.path.toLowerCase()===file.toLowerCase())
     if(existing){reused++;existing.lastOpenedAt=Date.now();this.persistProject(existing);continue}
     const source=await probeAudioSource(file,new AbortController().signal)
     const stream=source.streams[0],now=Date.now(),id=randomUUID()
     const p:AudioProject={id,source,streamIndex:stream.index,
      edit:{kept:[{startUs:0,endUs:stream.durationUs}],fadeMs:8,effect:'none',gainDb:0,loudnessLUFS:-16,truePeakDbtp:-1.5},
      revision:1,displayName:source.name,outputName:path.parse(source.name).name,createdAt:now,updatedAt:now,lastOpenedAt:now}
     this.projects.unshift(p);this.persistProject(p);added++
    }catch(e){skipped.push({path:file,reason:e instanceof Error?e.message:'无法探测音轨'})}
   }
   this.changed();return{added,reused,skipped}
  }finally{this.adding=false}
 }
 copy(id:string){
  this.assertAvailable()
  const source=this.get(id),now=Date.now()
  const p:AudioProject={...structuredClone(source),id:randomUUID(),displayName:source.displayName+'（副本）',
   outputName:source.outputName+'_copy',revision:1,createdAt:now,updatedAt:now,lastOpenedAt:now}
  this.projects.unshift(p);this.persistProject(p);this.changed();return structuredClone(p)
 }
 addTrack(id:string,index:number){
  this.assertAvailable()
  const p=this.get(id),stream=getProjectStream(p.source,index)
  const existing=this.projects.find(x=>x.source.path.toLowerCase()===p.source.path.toLowerCase()&&x.streamIndex===index)
  if(existing)return structuredClone(existing)
  const now=Date.now(),created:AudioProject={...structuredClone(p),id:randomUUID(),streamIndex:index,
   edit:{...p.edit,kept:[{startUs:0,endUs:stream.durationUs}],effect:'none'},revision:1,
   outputName:p.outputName+'_'+index,createdAt:now,updatedAt:now,lastOpenedAt:now}
  this.projects.unshift(created);this.persistProject(created);this.changed();return structuredClone(created)
 }
 save(id:string,revision:number,rawEdit:AudioEdit,outputName:string){
  this.assertAvailable();const p=this.get(id)
  if(p.revision!==revision)throw Error('编辑版本已变化，请刷新工程，避免覆盖其他修改')
  const stream=getProjectStream(p.source,p.streamIndex),edit=audioEditSchema.parse(rawEdit)
  edit.kept=canonicalKept(edit.kept,stream.durationUs)
  if(edit.kept.some(r=>r.endUs-r.startUs<10000))throw Error('保留片段至少需要0.01秒')
  const next:AudioProject={...p,edit,outputName:validAudioBaseName(outputName),revision:p.revision+1,lastOpenedAt:Date.now()}
  this.persistProject(next);Object.assign(p,next);this.changed();return structuredClone(p)
 }
 async relink(id:string,file:string){
  this.assertAvailable();const p=this.get(id)
  const candidate=await probeAudioSource(file,new AbortController().signal)
  const oldStream=getProjectStream(p.source,p.streamIndex)
  const match=candidate.streams.find(s=>s.codec===oldStream.codec&&s.durationUs===oldStream.durationUs&&s.startUs===oldStream.startUs&&s.sampleRate===oldStream.sampleRate&&s.channels===oldStream.channels)
  const oldDigest=p.source.signature.split(':').at(-1),newDigest=candidate.signature.split(':').at(-1)
  if(!match||candidate.size!==p.source.size||oldDigest!==newDigest)throw Error('所选文件与原音频不一致，为避免剪辑错位，请重新导入为新工程')
  p.source=candidate;p.streamIndex=match.index;p.revision++;this.persistProject(p);this.changed();return structuredClone(p)
 }
 async remove(ids:string[]){
  this.assertAvailable();const selected=new Set(ids)
  if(this.jobs.some(j=>selected.has(j.projectId)&&['queued','running'].includes(j.state)))throw Error('请先取消正在导出的任务')
  for(const id of selected)this.get(id)
  getDb().transaction(()=>{
   for(const id of selected){getDb().prepare('DELETE FROM audio_export_jobs WHERE project_id=?').run(id);getDb().prepare('DELETE FROM audio_projects WHERE id=?').run(id)}
  })()
  this.jobs=this.jobs.filter(j=>!selected.has(j.projectId));this.projects=this.projects.filter(p=>!selected.has(p.id))
  this.previewer.invalidate([...selected]);this.changed()
 }
 setPreferences(patch:Partial<AudioPreferences>){
  this.assertAvailable()
  const allowed=Object.keys(patch).every(k=>k==='cacheLimitBytes'||k==='outputDirectory')
  if(!allowed)throw Error('不支持的音频设置')
  const next={...this.preferences,...patch}
  if(!Number.isInteger(next.cacheLimitBytes)||next.cacheLimitBytes<128*1024**2||next.cacheLimitBytes>20*1024**3)throw Error('缓存限制应在128MB到20GB之间')
  if(next.outputDirectory&&!path.isAbsolute(next.outputDirectory))throw Error('输出目录必须为绝对路径')
  getDb().prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run('audioEditPrefs',JSON.stringify(next))
  this.preferences=next;this.changed()
 }
 async peaks(id:string,startUs:number,endUs:number,count:number){this.assertAvailable();return this.previewer.peaks(this.get(id),startUs,endUs,count)}
 async preview(id:string,edited:boolean){this.assertAvailable();const p=this.get(id);return this.previewer.preview(p,edited,this.preferences.cacheLimitBytes)}
 export(ids:string[],shared:AudioExportOptions){
  this.assertAvailable();if(!ids.length||ids.length>100)throw Error('一次最多导出100项')
  const options=audioExportOptionsSchema.parse(shared)
  const now=Date.now(),newJobs:AudioExportJob[]=[]
  for(const id of new Set(ids)){
   const p=this.get(id),stream=getProjectStream(p.source,p.streamIndex)
   const effective:AudioExportOptions={...options,directory:options.directory||this.preferences.outputDirectory,
    name:ids.length===1?validAudioBaseName(options.name):validAudioBaseName(p.outputName+(hasCuts(p.edit,stream.durationUs)?'_edited':''))}
   validateAudioExport(p.edit,stream,effective)
   audioExtension(stream,effective)
   newJobs.push({id:randomUUID(),projectId:p.id,projectName:p.displayName,revision:p.revision,
    edit:structuredClone(p.edit),stream:structuredClone(stream),source:structuredClone(p.source),options:effective,
    state:'queued',percent:0,error:'',outputPath:'',size:0,createdAt:now})
  }
  for(const job of newJobs){this.jobs.unshift(job);this.persistJob(job)}
  this.trim();this.changed();this.pump()
 }
 private trim(){
  const terminal=this.jobs.filter(j=>['completed','failed','cancelled','interrupted'].includes(j.state)).slice(300)
  for(const old of terminal)getDb().prepare('DELETE FROM audio_export_jobs WHERE id=?').run(old.id)
  const removed=new Set(terminal.map(j=>j.id));this.jobs=this.jobs.filter(j=>!removed.has(j.id))
 }
 retry(id:string){
  this.assertAvailable();const old=this.getJob(id)
  if(!['failed','cancelled','interrupted'].includes(old.state))throw Error('该任务不能重试')
  // 使用不可变的原始快照重试，确保结果与发起时相同。
  const job:AudioExportJob={...structuredClone(old),id:randomUUID(),state:'queued',error:'',percent:0,outputPath:'',size:0,createdAt:Date.now(),startedAt:undefined,finishedAt:undefined}
  this.jobs.unshift(job);this.persistJob(job);this.trim();this.changed();this.pump()
 }
 cancel(id:string){
  this.assertAvailable();const job=this.getJob(id),controller=this.controllers.get(id)
  if(controller)controller.abort()
  else if(job.state==='queued'){job.state='cancelled';job.finishedAt=Date.now();this.persistJob(job)}
  this.changed()
 }
 private pump(){
  if(this.closing||this.exclusive)return
  for(const job of this.jobs.slice().reverse()){
   if(this.controllers.size>=2)break
   if(job.state!=='queued')continue
   const controller=new AbortController();this.controllers.set(job.id,controller)
   job.state='running';job.startedAt=Date.now();this.persistJob(job)
   const promise=this.runExport(job,controller)
   this.active.add(promise);void promise.finally(()=>{this.active.delete(promise);this.pump()})
  }
 }
 private async runExport(job:AudioExportJob,controller:AbortController){
  try{
   const result=await renderAudioExport(job,controller.signal,value=>{job.percent=value;this.changed()})
   job.state='completed';job.percent=100;job.outputPath=result.path;job.size=result.size
  }catch(e){job.state=controller.signal.aborted?'cancelled':'failed';job.error=e instanceof Error?e.message:'导出失败'}
  finally{job.finishedAt=Date.now();this.controllers.delete(job.id);this.persistJob(job);this.trim();this.changed()}
 }
 async shutdown(){
  this.closing=true
  for(const job of this.jobs.filter(j=>j.state==='queued')){job.state='interrupted';job.error='ToolDock 已退出';job.finishedAt=Date.now();this.persistJob(job)}
  for(const controller of this.controllers.values())controller.abort()
  await Promise.allSettled([...this.active,this.previewer.shutdown()])
  if(this.eventTimer)clearTimeout(this.eventTimer)
 }
}
