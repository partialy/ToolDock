import {createReadStream,createWriteStream,promises as fs} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {pipeline} from 'node:stream/promises'
import path from 'node:path'
import {safeFilename} from './network'
import type {PoolItem,PoolPage} from '../../../../src/shared/fileTransferModels'

type RecordItem=PoolItem&{file:string|null}
type Source={deviceId:string;deviceName:string}
type Reserve=(size:number)=>Promise<()=>void>
const PAGE=100
const MAX_ITEMS=20000
const GIB=1024**3

/** All paths on disk are generated opaque IDs; remote names never form disk paths. */
export class FilePool {
 private items=new Map<string,RecordItem>()
 private folders=new Map<string,string>()
 private root:string|null=null
 private stopping=false
 private controllers=new Set<AbortController>()
 constructor(private changed:()=>void){}
 async open(root:string){this.items.clear();this.folders.clear();this.root=path.join(root,'pool');this.stopping=false;await fs.mkdir(path.join(this.root,'files'),{recursive:true})}
 get ready(){return Boolean(this.root)&&!this.stopping}
 get usedBytes(){let sum=0;for(const item of this.items.values())if(item.kind==='file')sum+=item.size;return sum}
 get itemCount(){return this.items.size}
 rootIds(){return [...this.items.values()].filter(item=>!item.parentId).map(item=>item.id)}
 list(parentId:string|null=null,cursor=0,search='',sort:'newest'|'oldest'|'name'|'size'='newest'):PoolPage{
  const query=search.toLocaleLowerCase().trim()
  if(parentId&&!this.items.has(parentId))throw Error('文件池目录不存在')
  const array=[...this.items.values()].filter(item=>query
   ?(item.name+' '+item.deviceName+' '+new Date(item.createdAt).toLocaleString()).toLocaleLowerCase().includes(query)
   :item.parentId===parentId)
  const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'})
  array.sort((a,b)=>sort==='name'?collator.compare(a.name,b.name):sort==='size'?b.size-a.size:sort==='oldest'?a.createdAt-b.createdAt:b.createdAt-a.createdAt)
  const offset=Math.max(0,Math.min(array.length,cursor))
  return {parentId,items:array.slice(offset,offset+PAGE).map(({file,...safe})=>safe),total:array.length,nextCursor:offset+PAGE<array.length?String(offset+PAGE):null,usedBytes:this.usedBytes,itemCount:this.itemCount}
 }
 get(id:string){const item=this.items.get(id);if(!item)throw Error('文件池条目不存在');return item}
 file(id:string){const item=this.get(id);if(item.kind!=='file'||!item.file)throw Error('只能下载文件');return {file:item.file,name:item.name,size:item.size}}
 private mkdir(name:string,parentId:string|null,src:Source,group?:string){
  if(this.items.size>=MAX_ITEMS)throw Error('文件池条目超过 20000 项')
  const clean=safeFilename(name)
  const key=group?src.deviceId+'\0'+group+'\0'+(parentId||'root')+'\0'+clean.toLocaleLowerCase():null
  if(key&&this.folders.has(key))return this.folders.get(key)!
  const id=randomUUID()
  this.items.set(id,{id,name:clean,kind:'directory',size:0,parentId,createdAt:Date.now(),deviceId:src.deviceId,deviceName:src.deviceName,file:null})
  if(key)this.folders.set(key,id)
  this.changed()
  return id
 }
 addFolders(paths:string[],src:Source,group:string){
  if(paths.length>20000)throw Error('目录条目过多')
  for(const relative of paths)this.folderPath(relative,src,group)
 }
 private folderPath(relative:string,src:Source,group:string){
  if(!relative)return null
  const parts=relative.replace(/\\/g,'/').split('/')
  if(parts.length>32||parts.some(part=>!part||part==='.'||part==='..'||part.length>250))throw Error('目录路径无效')
  let parent:string|null=null
  for(const part of parts)parent=this.mkdir(part,parent,src,group)
  return parent
 }
 async publish(temp:string,name:string,size:number,src:Source,relativeFolder='',group=''){
  if(!this.ready)throw Error('文件池未运行')
  if(this.items.size>=MAX_ITEMS)throw Error('文件池条目数已满')
  const parentId=relativeFolder?this.folderPath(relativeFolder,src,group):null
  const id=randomUUID(),location=path.join(this.root!,'files',id)
  const original=safeFilename(name)
  await fs.rename(temp,location)
  this.items.set(id,{id,name:original,kind:'file',size,parentId,createdAt:Date.now(),deviceId:src.deviceId,deviceName:src.deviceName,file:location})
  this.changed();return id
 }
 async addLocal(paths:string[],reserve:Reserve){
  if(!this.ready)throw Error('文件池未运行')
  const src={deviceId:'host',deviceName:'主设备'}
  const result={added:0,skipped:0,errors:[] as string[]}
  const group=randomUUID()
  const walk=async(absolute:string,parentId:string|null,depth:number):Promise<void>=>{
   if(this.stopping)throw Error('文件池已关闭')
   if(depth>32)throw Error('目录层级不能超过 32')
   if(this.items.size>=MAX_ITEMS)throw Error('文件池条目上限为 20000')
   const stat=await fs.lstat(absolute)
   if(stat.isSymbolicLink()){result.skipped++;return}
   if(stat.isDirectory()){
    const folder=this.mkdir(path.basename(absolute),parentId,src,group)
    for(const child of await fs.readdir(absolute))await walk(path.join(absolute,child),folder,depth+1)
    return
   }
   if(!stat.isFile()){result.skipped++;return}
   const release=await reserve(stat.size)
   const controller=new AbortController()
   this.controllers.add(controller)
   const staging=path.join(this.root!,'files',randomUUID()+'.part')
   try{
    await pipeline(createReadStream(absolute),createWriteStream(staging,{flags:'wx',mode:0o600}),{signal:controller.signal})
    if(this.stopping)throw Error('文件池已关闭')
    if((await fs.stat(staging)).size!==stat.size)throw Error('复制内容大小不一致')
    await this.publish(staging,path.basename(absolute),stat.size,src,'','')
    // Existing directory nodes keep their grouping; publish() defaults to the root.
    const added=[...this.items.values()].at(-1)!
    if(parentId){added.parentId=parentId;this.changed()}
    result.added++
   }finally{this.controllers.delete(controller);release();await fs.rm(staging,{force:true}).catch(()=>{})}
  }
  for(const item of paths){
   try{if(!path.isAbsolute(item)||item.startsWith('\\\\'))throw Error('仅支持本地绝对路径');await walk(path.resolve(item),null,0)}
   catch(e){result.errors.push(path.basename(item)+': '+(e instanceof Error?e.message:String(e)))}
  }
  return result
 }
 async remove(ids:string[]){
  const unique=new Set<string>()
  const collect=(id:string)=>{if(unique.has(id))return;this.get(id);unique.add(id);for(const item of this.items.values())if(item.parentId===id)collect(item.id)}
  ids.forEach(collect)
  for(const id of unique){const item=this.items.get(id)!;if(item.file)await fs.rm(item.file,{force:true});this.items.delete(id)}
  for(const [key,id] of this.folders)if(unique.has(id))this.folders.delete(key)
  this.changed();return unique
 }
 async clear(){
  for(const controller of this.controllers)controller.abort()
  this.controllers.clear()
  for(const item of this.items.values())if(item.file)await fs.rm(item.file,{force:true}).catch(()=>{})
  this.items.clear();this.folders.clear();this.changed()
 }
 async close(){this.stopping=true;await this.clear();this.root=null}
 entries(ids:string[]){
  const selected=new Set(ids)
  for(const id of selected)this.get(id)
  const result:RecordItem[]=[]
  const visit=(item:RecordItem,rel:string,depth:number)=>{
   if(depth>32||result.length>=MAX_ITEMS)throw Error('文件夹打包数量或层级超限')
   result.push({...item,name:rel})
   if(item.kind==='directory')for(const child of this.items.values())if(child.parentId===item.id)visit(child,rel+'/'+child.name,depth+1)
  }
  for(const id of selected){
   let current=this.get(id).parentId,skip=false
   while(current){if(selected.has(current)){skip=true;break}current=this.get(current).parentId}
   if(!skip)visit(this.get(id),this.get(id).name,0)
  }
  return result
 }
 async save(ids:string[],destination:string){
  if(!this.ready)throw Error('文件池未运行')
  const stat=await fs.stat(destination);if(!stat.isDirectory())throw Error('保存目标必须是文件夹')
  const controller=new AbortController();this.controllers.add(controller)
  const output:string[]=[]
  const unique=async(base:string,name:string,isDirectory:boolean)=>{
   const ext=isDirectory?'':path.extname(name),stem=name.slice(0,name.length-ext.length)
   for(let i=0;i<10000;i++){
    const next=path.join(base,i?stem+' ('+i+')'+ext:name)
    try{await fs.access(next)}catch{return next}
   }
   throw Error('目标文件重名次数过多')
  }
  const write=async(item:RecordItem,base:string,depth:number):Promise<void>=>{
   if(controller.signal.aborted||this.stopping)throw Error('保存已取消')
   if(depth>32)throw Error('目录层级过深')
   const dest=await unique(base,item.name,item.kind==='directory')
   if(item.kind==='directory'){
    await fs.mkdir(dest);output.push(dest)
    for(const child of this.items.values())if(child.parentId===item.id)await write(child,dest,depth+1)
   }else if(item.file){
    const temp=path.join(base,'.tooldock-save-'+randomUUID()+'.part')
    try{await pipeline(createReadStream(item.file),createWriteStream(temp,{flags:'wx',mode:0o600}),{signal:controller.signal})
     await fs.link(temp,dest);output.push(dest)
    }finally{await fs.rm(temp,{force:true}).catch(()=>{})}
   }
  }
  try{
   const top=this.entries(ids).filter(item=>!item.name.includes('/'))
   for(const item of top)await write(this.get(item.id),destination,0)
   return {saved:output.length}
  }finally{this.controllers.delete(controller)}
 }
}
