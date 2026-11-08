import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'

function normalized(file:string){const value=path.resolve(file);return process.platform==='win32'?value.toLowerCase():value}
function related(a:string,b:string){const x=normalized(a),y=normalized(b);return x===y||x.startsWith(y+path.sep)||y.startsWith(x+path.sep)}
function stat(file:string){try{return fs.lstatSync(file)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error}}
function sameDirectory(a:fs.Stats,b:fs.Stats){return a.dev===b.dev&&a.ino===b.ino&&a.birthtimeMs===b.birthtimeMs}
function realLocation(file:string):string {
 let ancestor=path.resolve(file);const suffix:string[]=[]
 while(!stat(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('目录所在磁盘不可访问');suffix.unshift(path.basename(ancestor));ancestor=parent}
 return path.join(fs.realpathSync.native(ancestor),...suffix)
}
function rejectLinkAncestors(file:string){
 let cursor=path.resolve(file)
 for(;;){const entry=stat(cursor);if(entry?.isSymbolicLink())throw Error('迁移目标不能包含符号链接或 Junction');const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent}
}
function digest(file:string){const hash=createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024);try{for(;;){const n=fs.readSync(fd,buffer,0,buffer.length,null);if(!n)break;hash.update(buffer.subarray(0,n))}return hash.digest('hex')}finally{fs.closeSync(fd)}}

/** A private sibling stage is the only directory eligible for recursive cleanup.
 * Publishing uses exclusive file creation and never removes the chosen directory.
 * Failed partial publications are retained so concurrent user writes cannot be lost.
 */
export function prepareDataMigration(source:string,target:string,blockedPaths:string[]=[]){
 if(!path.isAbsolute(target))throw Error('数据目录必须为绝对路径')
 source=path.resolve(source);target=path.resolve(target)
 const sourceStat=stat(source);if(!sourceStat?.isDirectory()||sourceStat.isSymbolicLink())throw Error('原数据目录不是可迁移的普通目录')
 rejectLinkAncestors(target)
 const realSource=fs.realpathSync.native(source),realTarget=realLocation(target)
 if(related(realSource,realTarget)||blockedPaths.some(blocked=>related(realTarget,realLocation(blocked))))throw Error('不能使用当前数据目录、程序目录或其上级/子级目录')
 const parent=path.dirname(target),parentStat=stat(parent)
 if(!parentStat?.isDirectory()||parentStat.isSymbolicLink())throw Error('目标目录的父目录必须已存在且不能为链接')
 let targetStat=stat(target)
 if(targetStat&&(!targetStat.isDirectory()||targetStat.isSymbolicLink()||fs.readdirSync(target).length))throw Error('目标目录必须为空，请选择一个空文件夹')
 fs.accessSync(targetStat?target:parent,fs.constants.W_OK)
 const stage=fs.mkdtempSync(path.join(parent,'.tooldock-migrate-')),stageStat=fs.lstatSync(stage),payload=path.join(stage,'data')
 let copied=false
 function ensureTarget(){
  rejectLinkAncestors(target)
  if(normalized(realLocation(target))!==normalized(realTarget)||!sameDirectory(parentStat!,fs.lstatSync(parent)))throw Error('迁移目标目录发生变化，已停止迁移')
  const current=stat(target)
  if(targetStat){if(!current?.isDirectory()||current.isSymbolicLink()||!sameDirectory(targetStat,current))throw Error('迁移目标已被替换，已停止迁移')}
  else if(current)throw Error('迁移目标已被其他操作创建，已停止迁移')
 }
 function publishFolder(from:string,to:string){
  rejectLinkAncestors(to)
  for(const entry of fs.readdirSync(from,{withFileTypes:true})){
   const input=path.join(from,entry.name),output=path.join(to,entry.name),info=fs.lstatSync(input)
   if(info.isSymbolicLink())throw Error('数据目录包含符号链接，无法安全迁移')
   rejectLinkAncestors(to)
   if(info.isDirectory()){fs.mkdirSync(output);publishFolder(input,output)}
   else if(info.isFile()){
    fs.copyFileSync(input,output,fs.constants.COPYFILE_EXCL)
    if(digest(input)!==digest(output))throw Error('迁移后的文件校验失败')
   }else throw Error('数据目录包含不支持的特殊文件')
  }
 }
 return {
  source:realSource,target,stage,payload,
  copy(){
   if(copied)throw Error('迁移副本已创建')
   const current=fs.lstatSync(source)
   if(current.isSymbolicLink()||!sameDirectory(sourceStat,current)||normalized(fs.realpathSync.native(source))!==normalized(realSource))throw Error('原数据目录已发生变化，已停止迁移')
   fs.cpSync(source,payload,{recursive:true,force:false,errorOnExist:true,filter:input=>{const cacheRoot=path.join(source,'audio-preview-cache');if(normalized(input)===normalized(cacheRoot)||normalized(input).startsWith(normalized(cacheRoot)+path.sep))return false;const info=fs.lstatSync(input);if(info.isSymbolicLink()||!info.isDirectory()&&!info.isFile())throw Error('数据目录包含符号链接或特殊文件，无法安全迁移');return true}})
   copied=true
  },
  publish(){
   if(!copied)throw Error('迁移副本尚未创建')
   ensureTarget()
   if(targetStat){if(fs.readdirSync(target).length)throw Error('目标目录已写入其他内容，已停止迁移')}
   else {fs.mkdirSync(target);targetStat=fs.lstatSync(target)}
   publishFolder(payload,target)
   ensureTarget()
  },
  cleanup(){const current=stat(stage),currentParent=stat(parent);if(current?.isDirectory()&&!current.isSymbolicLink()&&currentParent&&sameDirectory(parentStat!,currentParent)&&sameDirectory(stageStat,current)&&normalized(path.dirname(stage))===normalized(parent))fs.rmSync(stage,{recursive:true,force:true})}
 }
}
