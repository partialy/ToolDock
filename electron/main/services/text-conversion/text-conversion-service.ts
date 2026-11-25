import {app,dialog,type BrowserWindow} from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {randomUUID,createHash} from 'node:crypto'
import type {Worker} from 'node:worker_threads'
import {createWriteStream} from 'node:fs'
import {pipeline} from 'node:stream/promises'
import * as yazl from 'yazl'
import {getDb} from '../../database/store'
import {decodeInput} from './encoding'
import {assertUnchanged,extension,MAX_COUNT,MAX_TOTAL,publishExclusive,scanFiles,validName,type FoundFile} from './files'
import {runConversionWorker} from './worker-runner'
import {conversionPreferencesSchema,conversionPreferencesPatchSchema,type ConversionPreferences,type ConversionTask,type ConversionSnapshot,type ConversionEncoding,type ConversionAddResult,type ConversionSaveReport,type ConversionPreview} from '../../../../src/shared/textConversionModels'
import {outputSuffix} from '../../../../src/lib/text-conversion/conversion-core'

type RecordTask=ConversionTask & {ino:number;resultPath?:string;resultPrefs?:ConversionPreferences;queuedPrefs?:ConversionPreferences;worker?:Worker}
const key='textConversionPreferences'
const marker='tooldock-text-conversion-v1'
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e)
export class TextConversionService {
 private tasks=new Map<string,RecordTask>()
 private preferences:ConversionPreferences=conversionPreferencesSchema.parse({})
 private running=new Map<string,Promise<void>>()
 private session=''
 private closing=false
 private exclusive=false
 private exporting=0
 private changedTimer:ReturnType<typeof setTimeout>|undefined
 private lastChanged=0
 constructor(private window:()=>BrowserWindow|null){}
 async initialize(){
  const scope=createHash('sha256').update(app.getPath('userData').toLowerCase()).digest('hex').slice(0,16)
  const root=path.join(os.tmpdir(),(app.isPackaged?'tooldock-text-conversion-':'tooldock-text-conversion-dev-')+scope)
  const row=getDb().prepare('SELECT value_json FROM settings WHERE key=?').get(key)
  if(row)try{this.preferences=conversionPreferencesSchema.parse(JSON.parse(String(row.value_json)))}catch{}
  await fs.mkdir(root,{recursive:true})
  // Reclaim only a uniquely named directory with our exact marker and no symlinks.
  for(const entry of await fs.readdir(root,{withFileTypes:true})){
   if(!entry.isDirectory()||!/^[0-9a-f-]{36}$/.test(entry.name))continue
   const folder=path.join(root,entry.name)
   try{
    const s=await fs.lstat(folder)
    if(!s.isDirectory()||s.isSymbolicLink())continue
    if((await fs.readFile(path.join(folder,'.owner'),'utf8'))===marker)await fs.rm(folder,{recursive:true,force:true})
   }catch{}
  }
  this.session=path.join(root,randomUUID())
  await fs.mkdir(this.session,{recursive:false})
  await fs.writeFile(path.join(this.session,'.owner'),marker,{flag:'wx'})
 }
 changed(){
  if(this.changedTimer)return
  this.changedTimer=setTimeout(()=>{
   this.changedTimer=undefined
   const win=this.window()
   if(win&&!win.isDestroyed())win.webContents.send('textConversion:changed')
  },200)
 }
 /** 工作台汇总只取任务元信息，不传送源路径、保存路径或正文。 */
 dashboardTasks(){
  return [...this.tasks.values()].map(t=>({id:t.id,name:t.name,state:t.state,percent:t.percent,createdAt:t.createdAt,updatedAt:t.updatedAt,error:t.error}))
 }
 status():ConversionSnapshot{
  return{tasks:[...this.tasks.values()].map(({worker,resultPath,resultPrefs,queuedPrefs,ino,...task})=>({...task,savedPaths:[...task.savedPaths]})),preferences:{...this.preferences},busy:this.running.size>0||this.exporting>0}
 }
 private assertAvailable(){if(this.closing||this.exclusive||this.exporting)throw Error('简繁转换服务正在退出、导出文件或执行数据目录操作')}
 async dataMutation<T>(fn:()=>T|Promise<T>){
  this.assertAvailable()
  if(this.running.size||this.exporting||[...this.tasks.values()].some(t=>t.state==='queued'))throw Error('请先完成或取消简繁转换任务及文件导出')
  this.exclusive=true
  try{return await fn()}finally{this.exclusive=false}
 }
 async setPreferences(patch:Partial<ConversionPreferences>){
  this.assertAvailable()
  const accepted=conversionPreferencesPatchSchema.parse(patch)
  const next=conversionPreferencesSchema.parse({...this.preferences,...accepted})
  if(next.suffix&&(!/^[^<>:"/\\|?*\x00-\x1f]{1,64}$/.test(next.suffix)||/[. ]$/.test(next.suffix)))throw Error('自定义文件后缀不合法')
  getDb().prepare('INSERT INTO settings (key,value_json) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(key,JSON.stringify(next))
  this.preferences=next
  for(const task of this.tasks.values())if(!task.customName){
   task.outputName=path.parse(task.name).name+outputSuffix(next)+path.extname(task.name)
  }
  this.changed()
 }
 private getTask(id:string){const task=this.tasks.get(id);if(!task)throw Error('转换任务不存在');return task}
 private recordSource(t:RecordTask):FoundFile{return{path:t.inputPath,size:t.size,mtimeMs:t.mtimeMs,ino:t.ino}}
 async addSources(paths:string[]):Promise<ConversionAddResult>{
  this.assertAvailable()
  if(paths.length>100)throw Error('单次最多添加 100 个文件或目录')
  const scanned=await scanFiles(paths)
  const skipped=[...scanned.skipped],existing=new Set([...this.tasks.values()].map(t=>t.inputPath.toLowerCase()))
  let total=[...this.tasks.values()].reduce((n,t)=>n+t.size,0),added=0
  for(const f of scanned.files){
   if(existing.has(f.path.toLowerCase())){skipped.push({path:f.path,reason:'文件已在队列中'});continue}
   if(this.tasks.size>=MAX_COUNT){skipped.push({path:f.path,reason:'队列最多 100 项'});continue}
   if(total+f.size>MAX_TOTAL){skipped.push({path:f.path,reason:'队列累计大小超过 500 MiB'});continue}
   const now=Date.now(),name=path.basename(f.path)
   const task:RecordTask={
    id:randomUUID(),name,inputPath:f.path,size:f.size,mtimeMs:f.mtimeMs,ino:f.ino,
    state:'ready',percent:0,outputName:path.parse(name).name+outputSuffix(this.preferences)+path.extname(name),
    customName:false,error:'',attempts:0,savedPaths:[],createdAt:now,updatedAt:now
   }
   this.tasks.set(task.id,task);existing.add(f.path.toLowerCase());total+=f.size;added++
  }
  this.changed()
  return{added,skipped}
 }
 rename(id:string,name:string){
  this.assertAvailable()
  const t=this.getTask(id),ext=extension(t.name)
  t.outputName=validName(name,ext)+'.'+ext;t.customName=true;t.updatedAt=Date.now();this.changed()
 }
 setEncoding(id:string,encoding:ConversionEncoding){
  this.assertAvailable()
  const t=this.getTask(id)
  if(t.state==='running'||t.state==='queued')throw Error('正在处理时不能修改输入编码')
  t.encodingOverride=encoding;t.updatedAt=Date.now();this.changed()
 }
 start(ids:string[],force=false){
  this.assertAvailable()
  if(ids.length>MAX_COUNT)throw Error('单次最多操作 100 个文件')
  const unique=new Set(ids)
  for(const id of unique){
   const t=this.getTask(id)
   if(t.state==='running'||t.state==='queued')continue
   if(t.state==='completed'&&!force)continue
   t.state='queued';t.queuedPrefs={...this.preferences};t.percent=0;t.error='';t.updatedAt=Date.now()
  }
  this.pump();this.changed()
 }
 private pump(){
  if(this.closing||this.exclusive)return
  for(const t of this.tasks.values()){
   if(this.running.size>=2)break
   if(t.state!=='queued')continue
   t.state='running';t.attempts++;t.updatedAt=Date.now()
   const running=this.execute(t).finally(()=>{this.running.delete(t.id);this.pump();this.changed()})
   this.running.set(t.id,running)
  }
  this.changed()
 }
 private async execute(t:RecordTask){
  const output=path.join(this.session,t.id+'-'+randomUUID()+'.part')
  const old=t.resultPath
  const settings=t.queuedPrefs||{...this.preferences}
  try{
   await assertUnchanged(this.recordSource(t))
   const result=await runConversionWorker({
    inputPath:t.inputPath,
    outputPath:output,
    settings,
    encoding:t.encodingOverride||settings.inputEncoding,
    onWorker:worker=>{t.worker=worker},
    onProgress:percent=>{
     if(!this.tasks.has(t.id))return
     t.percent=percent;t.updatedAt=Date.now();this.changed()
    }
   })
   if(this.closing||!this.tasks.has(t.id)||t.state==='cancelled')throw Error('转换已取消')
   await assertUnchanged(this.recordSource(t))
   t.resultPath=output;t.resultPrefs=settings;t.detectedEncoding=result.encoding;t.outputBytes=result.bytes
   t.state='completed';t.percent=100;t.error='';t.updatedAt=Date.now()
   if(old&&old!==output)await fs.unlink(old).catch(()=>{})
  }catch(e){
   if(this.tasks.has(t.id)){
    const cancelled=t.state==='cancelled'||this.closing
    t.state=old?'completed':cancelled?'cancelled':'failed'
    t.error=old?'重新转换未成功，保留上次有效结果：'+errorText(e):cancelled?'':errorText(e)
    t.percent=old?100:0;t.updatedAt=Date.now()
   }
  }finally{
   t.queuedPrefs=undefined
   t.worker=undefined
   if(t.resultPath!==output)await fs.unlink(output).catch(()=>{})
   this.changed()
  }
 }
 async cancel(id:string){
  this.assertAvailable()
  const t=this.getTask(id)
  if(t.state==='queued'||t.state==='ready'){t.state='cancelled';this.changed();return}
  if(t.state!=='running')return
  t.state='cancelled';await t.worker?.terminate();await this.running.get(id)?.catch(()=>{});this.changed()
 }
 async remove(ids:string[]){
  this.assertAvailable()
  for(const id of new Set(ids.slice(0,MAX_COUNT))){
   const t=this.getTask(id)
   if(t.state==='running')await this.cancel(id)
   this.tasks.delete(id)
   if(t.resultPath)await fs.unlink(t.resultPath).catch(()=>{})
  }
  this.changed()
 }
 private async content(id:string,side:'source'|'result'){
  const t=this.getTask(id)
  const file=side==='source'?t.inputPath:t.resultPath
  if(!file)throw Error('转换结果尚未生成')
  const stat=await fs.stat(file)
  if(stat.size>50*1024*1024)throw Error('文件超过 50 MiB 预览限制')
  const bytes=await fs.readFile(file)
  const enc=side==='source'?(t.encodingOverride||t.detectedEncoding||this.preferences.inputEncoding):
   (t.resultPrefs?.outputEncoding==='utf8'?'utf8':t.detectedEncoding||'utf8')
  return decodeInput(bytes,enc as ConversionEncoding).text
 }
 async preview(id:string,side:'source'|'result',offset:number,length:number):Promise<ConversionPreview>{
  if(offset<0||length<1||length>16000||!Number.isSafeInteger(offset))throw Error('预览参数超出限制')
  const text=await this.content(id,side)
  return{text:text.slice(offset,offset+length),total:text.length,offset}
 }
 async search(id:string,side:'source'|'result',query:string,from=0){
  if(!query||query.length>100||from<0||!Number.isSafeInteger(from))throw Error('搜索参数无效')
  return(await this.content(id,side)).indexOf(query,from)
 }
 private candidates(ids:string[]){
  const result:RecordTask[]=[]
  for(const id of new Set(ids.slice(0,MAX_COUNT))){
   const t=this.getTask(id)
   if(t.resultPath&&t.state==='completed')result.push(t)
  }
  if(!result.length)throw Error('没有已完成的文件可以导出')
  return result
 }
 private win(){const win=this.window();if(!win||win.isDestroyed())throw Error('窗口尚未就绪');return win}
 private async exportScope<T>(fn:()=>Promise<T>){
  this.assertAvailable();this.exporting++;this.changed()
  try{return await fn()}finally{this.exporting--;this.changed()}
 }
 async saveOne(id:string):Promise<string|null>{
  return this.exportScope(async()=>{
   const t=this.candidates([id])[0]
   const picked=await dialog.showSaveDialog(this.win(),{title:'保存转换结果',defaultPath:t.outputName,filters:[{name:'文本文件',extensions:[extension(t.name)]}]})
   if(picked.canceled||!picked.filePath)return null
   if(path.extname(picked.filePath).toLowerCase()!==path.extname(t.name).toLowerCase())throw Error('保存扩展名不可修改')
   const target=await publishExclusive(t.resultPath!,path.resolve(picked.filePath),[t.inputPath])
   t.savedPaths.push(target);this.changed();return target
  })
 }
 async saveSelected(ids:string[]):Promise<ConversionSaveReport|null>{
  return this.exportScope(async()=>{
   const tasks=this.candidates(ids)
   const picked=await dialog.showOpenDialog(this.win(),{title:'选择批量保存位置',properties:['openDirectory','createDirectory']})
   if(picked.canceled||!picked.filePaths[0])return null
   const dir=picked.filePaths[0],saved:string[]=[],failed:{name:string;reason:string}[]=[]
   for(const t of tasks){
    try{
     const target=await publishExclusive(t.resultPath!,path.join(dir,t.outputName),[t.inputPath,...Array.from(this.tasks.values(),x=>x.inputPath)])
     saved.push(target);t.savedPaths.push(target)
    }catch(e){failed.push({name:t.name,reason:errorText(e)})}
   }
   this.changed();return{saved,failed,skipped:new Set(ids).size-tasks.length}
  })
 }
 async saveZip(ids:string[]):Promise<string|null>{
  return this.exportScope(async()=>{
   const tasks=this.candidates(ids),stamp=new Date().toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15)
   const picked=await dialog.showSaveDialog(this.win(),{title:'打包保存转换结果',defaultPath:'简繁转换_'+stamp+'.zip',filters:[{name:'ZIP 压缩包',extensions:['zip']}]})
   if(picked.canceled||!picked.filePath)return null
   if(path.extname(picked.filePath).toLowerCase()!=='.zip')throw Error('压缩包必须使用 ZIP 扩展名')
   const dir=path.dirname(path.resolve(picked.filePath)),stage=path.join(dir,'.tooldock-text-'+randomUUID()+'.zip.part')
   try{
    const zip=new yazl.ZipFile(),used=new Set<string>()
    for(const t of tasks){
     const p=path.parse(t.outputName)
     let name=t.outputName
     for(let n=1;used.has(name.toLowerCase());n++)name=p.name+' ('+n+')'+p.ext
     used.add(name.toLowerCase())
     zip.addFile(t.resultPath!,name)
    }
    zip.end()
    await pipeline(zip.outputStream,createWriteStream(stage,{flags:'wx',mode:0o600}))
    const exported=await publishExclusive(stage,path.resolve(picked.filePath),tasks.map(t=>t.inputPath))
    return exported
   }finally{await fs.unlink(stage).catch(()=>{})}
  })
 }
 async shutdown(){
  this.closing=true
  for(const t of this.tasks.values())if(t.state==='queued')t.state='cancelled'
  await Promise.allSettled([...this.tasks.values()].map(t=>t.worker?.terminate()).filter(Boolean))
  await Promise.allSettled([...this.running.values()])
  if(this.changedTimer)clearTimeout(this.changedTimer)
  if(this.session){
   const stat=await fs.lstat(this.session).catch(()=>null)
   if(stat?.isDirectory()&&!stat.isSymbolicLink()&&(await fs.readFile(path.join(this.session,'.owner'),'utf8').catch(()=>''))===marker){
    await fs.rm(this.session,{recursive:true,force:true}).catch(()=>{})
   }
  }
  this.tasks.clear()
 }
}
