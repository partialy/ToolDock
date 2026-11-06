import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import AdmZip from 'adm-zip'
import type {DownloadState,MediaPreferences,ModelRecord} from '../../../../src/shared/mediaModels'
import {CUDA_ASSET,MODEL_CATALOG,catalogModel} from './model-catalog'
import {downloadAsset,sha256} from './model-download'
import {mediaBinaryRoot} from './engines'
import {getDb} from '../../database/store'

type Config={getPreferences:()=>MediaPreferences;setDirectory:(directory:string)=>void;getRuntimeDirectory:()=>string;isBusy:()=>boolean;onChange:()=>void}
type Imported={id:string;name:string;path:string;sha256:string;bytes:number;reference:boolean;verified:boolean}
export class ModelStorage {
 private states=new Map<string,DownloadState>();private controllers=new Map<string,AbortController>();private work=new Map<string,Promise<void>>();private mutation=false;private hashCache=new Map<string,string>();private closing=false;private mutationFinished:Promise<void>=Promise.resolve();private finishMutation:()=>void=()=>{}
 constructor(private config:Config){}
 private directory(){const d=this.config.getPreferences().modelDirectory;if(!path.isAbsolute(d))throw Error('模型目录必须为绝对路径');return d}
 /** 导入/引用元信息随 SQLite 备份，模型正文与可执行引擎仍然排除。 */
 private async imports():Promise<Imported[]>{
  const row=getDb().prepare("SELECT value_json FROM settings WHERE key='mediaImportedModels'").get()
  try{const rows=JSON.parse(String(row?.value_json||'[]'));if(!Array.isArray(rows))return[];return rows.filter((m:Imported)=>typeof m.id==='string'&&/^import-[0-9a-f-]{36}$/.test(m.id)&&typeof m.path==='string'&&path.isAbsolute(m.path)&&typeof m.sha256==='string'&&/^[0-9a-f]{64}$/.test(m.sha256)&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&typeof m.reference==='boolean'&&(m.reference||path.basename(m.path)===m.id+'.bin')) as Imported[]}catch{return[]}
 }
 private async saveImports(rows:Imported[]){getDb().prepare("INSERT INTO settings VALUES ('mediaImportedModels',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify(rows))}
 private assertIdle(){if(this.closing||this.config.isBusy()||this.mutation||this.controllers.size)throw Error('请先停止媒体任务和下载，再修改模型或引擎')}
 private beginMutation(){this.assertIdle();this.mutation=true;this.mutationFinished=new Promise(resolve=>{this.finishMutation=resolve})}
 private endMutation(){this.mutation=false;this.finishMutation();this.config.onChange()}
 private async verifiedHash(file:string,expected:string){const stat=await fs.stat(file).catch(()=>null);if(!stat?.isFile())return false;const key=await fs.realpath(file)+':'+stat.size+':'+stat.mtimeMs;let h=this.hashCache.get(key);if(!h){h=await sha256(file);this.hashCache.set(key,h)}return h===expected}
 isBusy(){return this.mutation||this.controllers.size>0}
 downloads(){return [...this.states.values()]}
 async list():Promise<ModelRecord[]>{
  const result:ModelRecord[]=[]
  for(const model of MODEL_CATALOG){const file=path.join(this.directory(),'ggml-'+model.id+'.bin');const stat=await fs.stat(file).catch(()=>null);let verified=false
   if(stat?.isFile()&&stat.size===model.bytes)verified=await this.verifiedHash(file,model.sha256)
   result.push({...model,path:stat?file:undefined,installed:verified,verified})
   if(!this.states.has(model.id)){const part=file+'.part',metadata=await fs.readFile(part+'.json','utf8').then(x=>JSON.parse(x)).catch(()=>null);if(metadata?.hash===model.sha256&&Array.isArray(metadata.segments))this.states.set(model.id,{id:model.id,state:'paused',received:metadata.segments.filter((s:{done:boolean})=>s.done).reduce((n:number,s:{start:number;end:number})=>n+s.end-s.start+1,0),total:model.bytes})}
  }
  for(const m of await this.imports()){const stat=await fs.stat(m.path).catch(()=>null),intact=stat?.size===m.bytes&&await this.verifiedHash(m.path,m.sha256);result.push({...m,url:'',installed:Boolean(intact),verified:m.verified&&Boolean(intact)})}
  return result
 }
 async resolveModel(id:string){const model=(await this.list()).find(m=>m.id===id);if(!model?.installed||!model.path)throw Error('请先下载或导入所选模型');if(await sha256(model.path)!==model.sha256)throw Error('模型校验失败，请重新下载或导入');return model.path}
 async download(id:string){
  if(this.closing||this.config.isBusy()||this.controllers.has(id)||this.mutation)throw Error('媒体任务、下载或目录操作正在进行')
  const model=catalogModel(id),controller=new AbortController();this.controllers.set(id,controller);const file=path.join(this.directory(),'ggml-'+id+'.bin')
  const prefs=this.config.getPreferences(),work=(async()=>{await fs.mkdir(this.directory(),{recursive:true});if(await fs.stat(file).then(()=>true).catch(()=>false))throw Error('模型文件已存在，请先删除或导入该文件');await downloadAsset(model,file,{acceleration:prefs.accelerationEnabled,segments:prefs.parallelSegments,signal:controller.signal,update:s=>{this.states.set(id,s);this.config.onChange()}})})()
   .catch(error=>{const old=this.states.get(id);if(old?.state!=='cancelled')this.states.set(id,{id,state:controller.signal.aborted?'paused':'failed',received:old?.received||0,total:model.bytes,error:controller.signal.aborted?undefined:error instanceof Error?error.message:'下载失败'})})
   .finally(()=>{this.controllers.delete(id);this.work.delete(id);this.config.onChange()})
  this.work.set(id,work);this.config.onChange()
 }
 async pause(id:string){this.controllers.get(id)?.abort();await this.work.get(id)}
 async resume(id:string){if(id==='cuda-engine')await this.installCuda();else await this.download(id)}
 async cancel(id:string){if(this.mutation||this.closing||this.config.isBusy())throw Error('请先完成媒体或目录操作');const old=this.states.get(id);this.states.set(id,{id,state:'cancelled',received:0,total:old?.total||0});this.controllers.get(id)?.abort();await this.work.get(id);this.beginMutation();try{const m=MODEL_CATALOG.find(x=>x.id===id);if(m){const file=path.join(this.directory(),'ggml-'+id+'.bin.part');await fs.unlink(file).catch(()=>{});await fs.unlink(file+'.json').catch(()=>{});await fs.unlink(file+'.json.tmp').catch(()=>{})}}finally{this.endMutation()}}
 async importFile(input:string,reference:boolean){
  this.beginMutation()
  try{
   if(!path.isAbsolute(input)||path.extname(input).toLowerCase()!=='.bin')throw Error('请选择本地 .bin 模型')
   const stat=await fs.stat(input);if(!stat.isFile()||stat.size<1024||stat.size>4*1024**3)throw Error('模型文件大小无效')
   const h=await sha256(input),known=MODEL_CATALOG.find(x=>x.sha256===h),id='import-'+randomUUID();let file=input
   if(!reference){await fs.mkdir(this.directory(),{recursive:true});file=path.join(this.directory(),id+'.bin');await fs.copyFile(input,file,2);if(await sha256(file)!==h){await fs.unlink(file);throw Error('导入文件校验失败')}}
   const rows=await this.imports();rows.push({id,name:known?.name||path.basename(input),path:file,sha256:h,bytes:stat.size,reference,verified:Boolean(known)});await this.saveImports(rows)
  }finally{this.endMutation()}
 }
 async remove(id:string){
  this.beginMutation()
  try{const official=MODEL_CATALOG.find(x=>x.id===id);if(official)await fs.unlink(path.join(this.directory(),'ggml-'+id+'.bin')).catch(e=>{if(e.code!=='ENOENT')throw e});else{const rows=await this.imports(),m=rows.find(x=>x.id===id);if(!m)throw Error('模型不存在');if(!m.reference&&path.dirname(m.path)===this.directory())await fs.unlink(m.path).catch(e=>{if(e.code!=='ENOENT')throw e});await this.saveImports(rows.filter(x=>x.id!==id))}}finally{this.endMutation()}
 }
 async migrateDirectory(directory:string,move:boolean){
  this.assertIdle();if(!path.isAbsolute(directory))throw Error('模型目录必须为绝对路径');directory=path.resolve(directory);const old=this.directory();if(directory.toLowerCase()===old.toLowerCase())return
  this.beginMutation()
  try{
   await fs.mkdir(directory,{recursive:true});const test=path.join(directory,'.tooldock-write-'+randomUUID());await fs.writeFile(test,'',{flag:'wx'});await fs.unlink(test)
   if(move){const imports=await this.imports(),previousImports=JSON.parse(JSON.stringify(imports)) as Imported[],models=(await this.list()).filter(m=>m.installed&&!m.reference&&m.path&&path.dirname(m.path)===old),copied:string[]=[]
    try{for(const m of models){const target=path.join(directory,path.basename(m.path!));if(await fs.stat(target).then(()=>true).catch(()=>false)){if(await sha256(target)!==m.sha256)throw Error('目标目录有不同内容的同名模型')}else{await fs.copyFile(m.path!,target,2);copied.push(target)}if(await sha256(target)!==m.sha256)throw Error('迁移校验失败')}
     for(const m of imports)if(!m.reference&&path.dirname(m.path)===old)m.path=path.join(directory,path.basename(m.path));await this.saveImports(imports);this.config.setDirectory(directory)
    }catch(error){await this.saveImports(previousImports);for(const p of copied)await fs.unlink(p).catch(()=>{});throw error}
    // Retain original files; removing an external model directory requires a separate user action.
   }else this.config.setDirectory(directory)
  }finally{this.endMutation()}
 }
 async installCuda(){
  this.assertIdle();const id='cuda-engine',controller=new AbortController();this.controllers.set(id,controller)
  const root=this.config.getRuntimeDirectory(),archive=path.join(root,'cuda-'+CUDA_ASSET.version+'.zip'),target=path.join(root,'cuda'),stage=path.join(root,'cuda-stage-'+randomUUID())
  const work=(async()=>{await fs.mkdir(root,{recursive:true});if(await fs.stat(target).then(()=>true).catch(()=>false))throw Error('CUDA 引擎已安装');if(await sha256(archive).catch(()=> '')!==CUDA_ASSET.sha256){await fs.unlink(archive).catch(()=>{});await downloadAsset({...CUDA_ASSET,id},archive,{acceleration:false,segments:4,signal:controller.signal,update:s=>{this.states.set(id,s);this.config.onChange()}})}
   if(controller.signal.aborted)throw Error('安装已暂停');await fs.mkdir(stage);const zip=new AdmZip(archive);let total=0;for(const e of zip.getEntries()){if(controller.signal.aborted)throw Error('安装已暂停');if(e.isDirectory)continue;const name=path.posix.basename(e.entryName);if(!(/\.dll$/i.test(name)||name==='whisper-cli.exe'||/license|copying/i.test(name)))continue;total+=e.header.size;if(total>2*1024**3)throw Error('CUDA 资产解压大小超限');await fs.writeFile(path.join(stage,name),e.getData(),{flag:'wx'})}
   for(const name of ['THIRD-PARTY-NOTICES.md','whisper-LICENSE.txt','SDL2-LICENSE.txt'])await fs.copyFile(path.join(mediaBinaryRoot(),'whisper',name),path.join(stage,name))
   await fs.stat(path.join(stage,'whisper-cli.exe'));if(controller.signal.aborted)throw Error('安装已暂停');await fs.rename(stage,target);this.states.set(id,{id,state:'completed',received:CUDA_ASSET.bytes,total:CUDA_ASSET.bytes})})()
   .catch(error=>{this.states.set(id,{id,state:controller.signal.aborted?'paused':'failed',received:0,total:CUDA_ASSET.bytes,error:error instanceof Error?error.message:'CUDA 安装失败'})})
   .finally(async()=>{await fs.rm(stage,{recursive:true,force:true});this.controllers.delete(id);this.work.delete(id);this.config.onChange()});this.work.set(id,work);this.config.onChange()
 }
 async removeCuda(){this.beginMutation();try{await fs.rm(path.join(this.config.getRuntimeDirectory(),'cuda'),{recursive:true,force:true})}finally{this.endMutation()}}
 async shutdown(){this.closing=true;for(const controller of this.controllers.values())controller.abort();await Promise.allSettled([...this.work.values(),this.mutationFinished])}
}
