import {promises as fs} from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

export type Kind='file'|'directory'
export type Root={id:string;file:string;kind:Kind;name:string}
export type TreeItem={id:string;name:string;kind:Kind;size:number;rootId?:string;status:'ready'|'missing'|'changed'}
type Internal=TreeItem&{rootId:string;relative:string}

/** Nodes are opaque session-local IDs; no filesystem path is ever sent to the mobile client. */
export class SharedTree {
 private nodes=new Map<string,Internal>()
 private byKey=new Map<string,string>()
 constructor(private roots:()=>Map<string,Root>){}
 clear(){this.nodes.clear();this.byKey.clear()}
 removeRoot(id:string){
  for(const [nodeId,n] of this.nodes)if(n.rootId===id)this.nodes.delete(nodeId)
  for(const [k] of this.byKey)if(k.startsWith(id+'\0'))this.byKey.delete(k)
 }
 private add(root:Root,rel:string,kind:Kind,size:number):Internal{
  if(!rel)return {id:root.id,rootId:root.id,relative:'',name:root.name,kind:root.kind,size,status:'ready'}
  const key=root.id+'\0'+rel.toLocaleLowerCase()
  let id=this.byKey.get(key)
  if(!id){id=randomUUID();this.byKey.set(key,id)}
  const node:Internal={id,rootId:root.id,relative:rel,name:path.basename(rel),kind,size,status:'ready'}
  this.nodes.set(id,node)
  return node
 }
 rootFor(id:string){return this.roots().get(id)||this.roots().get(this.nodes.get(id)?.rootId||'')}
 /** Source path is computed solely from a session-held root and its known relative components. */
 async resolve(id:string,expected?:Kind){
  const root=this.rootFor(id)
  const node=this.nodes.get(id)
  if(!root)throw Error('共享项目不存在')
  const rel=id===root.id?'':node?.relative
  if(rel===undefined)throw Error('目录条目已失效')
  const filepath=path.resolve(root.file,rel)
  const diff=path.relative(root.file,filepath)
  if(diff==='..'||diff.startsWith('..'+path.sep)||path.isAbsolute(diff))throw Error('不允许访问共享目录之外的路径')
  // lstat every path component: symlinks/junctions must not escape the shared root.
  let cursor=root.file
  const parts=rel?rel.split(path.sep):[]
  for(let i=-1;i<parts.length;i++){
   if(i>=0)cursor=path.join(cursor,parts[i])
   const stat=await fs.lstat(cursor)
   if(stat.isSymbolicLink())throw Error('跳过符号链接或 Junction')
   if(i<parts.length-1&&!stat.isDirectory())throw Error('目录结构已改变')
  }
  const realRoot=await fs.realpath(root.file),real=await fs.realpath(filepath)
  const dr=path.relative(realRoot,real)
  if(dr==='..'||dr.startsWith('..'+path.sep)||path.isAbsolute(dr))throw Error('路径不在共享根目录内')
  const stat=await fs.stat(filepath)
  const kind:Kind=stat.isDirectory()?'directory':'file'
  if(!stat.isFile()&&!stat.isDirectory())throw Error('不是普通文件或文件夹')
  if(expected&&kind!==expected)throw Error('共享项类型已改变')
  return {root,filepath,kind,stat,relative:rel}
 }
 async list(parentId:string,cursor=0,pageSize=200) {
  const {root,filepath}=await this.resolve(parentId,'directory')
  const entries=await fs.readdir(filepath,{withFileTypes:true})
  const items:TreeItem[]=[]
  for(const dirent of entries){
   try{
    if(dirent.isSymbolicLink())continue
    const filepath2=path.join(filepath,dirent.name)
    const st=await fs.lstat(filepath2)
    if(st.isSymbolicLink()||(!st.isFile()&&!st.isDirectory()))continue
    const rel=path.relative(root.file,filepath2)
    const realRoot=await fs.realpath(root.file),real=await fs.realpath(filepath2)
    const check=path.relative(realRoot,real)
    if(check==='..'||check.startsWith('..'+path.sep)||path.isAbsolute(check))continue
    const node=this.add(root,rel,st.isDirectory()?'directory':'file',st.isFile()?st.size:0)
    items.push({id:node.id,kind:node.kind,name:node.name,size:node.size,rootId:root.id,status:'ready'})
   }catch{/* inaccessible entries are never listed */}
  }
  const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'})
  items.sort((a,b)=>(a.kind==='directory'?0:1)-(b.kind==='directory'?0:1)||collator.compare(a.name,b.name))
  const start=Math.max(0,Math.min(cursor,items.length))
  return {parentId,items:items.slice(start,start+pageSize),nextCursor:start+pageSize<items.length?String(start+pageSize):null,total:items.length}
 }
 async stats(id:string){
  const {filepath,root}=await this.resolve(id,'directory')
  let files=0,directories=0,bytes=0,truncated=false
  const walk=async(dir:string,depth:number):Promise<void>=>{
   if(depth>32){truncated=true;return}
   for(const child of await fs.readdir(dir,{withFileTypes:true})){
    if(files+directories>=20000){truncated=true;return}
    const absolute=path.join(dir,child.name)
    try{
     const st=await fs.lstat(absolute)
     if(st.isSymbolicLink())continue
     const realRoot=await fs.realpath(root.file),real=await fs.realpath(absolute)
     const diff=path.relative(realRoot,real)
     if(diff==='..'||diff.startsWith('..'+path.sep)||path.isAbsolute(diff))continue
     if(st.isDirectory()){directories++;await walk(absolute,depth+1)}
     else if(st.isFile()){files++;bytes+=st.size}
    }catch{/* Ignore inaccessible children; user can still share other entries. */}
   }
  }
  await walk(filepath,0)
  return {files,directories,bytes,truncated}
 }
 async expandZip(ids:string[]){
  type Entry={path:string;name:string;size:number;mtime:Date;directory:boolean;rootId:string}
  const selected=[...new Set(ids)]
  const roots=this.roots()
  const checked=await Promise.all(selected.map(async id=>({id,...await this.resolve(id)})))
  const unique=checked.filter(e=>!checked.some(parent=>parent.id!==e.id&&parent.root.id===e.root.id&&parent.kind==='directory'&&e.filepath.startsWith(parent.filepath+path.sep)))
  const names=new Set<string>(),out:Entry[]=[]
  let total=0
  const maxEntries=20000,maxBytes=200*1024**3,maxDepth=32
  for(const item of unique){
   const sourceName=path.basename(item.filepath)
   const original=sourceName.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')||'共享文件'
   let top=original,k=1
   while(names.has(top.toLocaleLowerCase())){const ext=item.kind==='file'?path.extname(original):'';top=original.slice(0,original.length-ext.length)+' ('+k+++')'+ext}
   names.add(top.toLocaleLowerCase())
   const walk=async(filepath:string,relativeZip:string,depth:number)=>{
    if(depth>maxDepth)throw Error('文件夹超过最大 32 层')
    if(out.length>=maxEntries)throw Error('ZIP 文件条目超过 20000')
    const diff=path.relative(item.root.file,filepath)
    const parentDir=item.root.file
    let curr=parentDir
    for(const part of diff?diff.split(path.sep):[]){
     curr=path.join(curr,part)
     if((await fs.lstat(curr)).isSymbolicLink())return
    }
    const stat=await fs.lstat(filepath)
    if(stat.isSymbolicLink())return
    const realRoot=await fs.realpath(item.root.file)
    const real=await fs.realpath(filepath)
    const check=path.relative(realRoot,real)
    if(check==='..'||check.startsWith('..'+path.sep)||path.isAbsolute(check))throw Error('路径越过共享根目录')
    if(stat.isDirectory()){
     out.push({path:filepath,name:relativeZip+'/',size:0,mtime:stat.mtime,directory:true,rootId:item.root.id})
     for(const name of await fs.readdir(filepath)){
      const child=path.join(filepath,name)
      await walk(child,relativeZip+'/'+name,depth+1)
     }
    }else if(stat.isFile()){
     total+=stat.size
     if(total>maxBytes)throw Error('ZIP 原始数据超过 200 GiB')
     out.push({path:filepath,name:relativeZip,size:stat.size,mtime:stat.mtime,directory:false,rootId:item.root.id})
    }
   }
   await walk(item.filepath,top,0)
  }
  if(!out.length)throw Error('没有可下载的文件')
  return {entries:out,total,roots:new Set(out.map(x=>x.rootId))}
 }
}
