import fs from 'node:fs'
import path from 'node:path'
import type {JunctionInput,JunctionPreview,JunctionResult} from '../../../src/shared/commandModels'

const drivePath=/^[a-zA-Z]:\\/
const reserved=/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i
function localAbsolute(raw:string,label:string){
 if(process.platform!=='win32')throw Error('仅支持 Windows 系统')
 const rawPath=raw.trim()
 const p=/^[a-zA-Z]:\\+$/.test(rawPath)?rawPath.slice(0,3):rawPath.replace(/\\+$/,'')
 if(!drivePath.test(p)||p.startsWith('\\\\')||p.includes('/'))throw Error(label+'必须是本地磁盘的绝对路径，例如 D:\\Workspace')
 if(p.includes('\0')||p.length>1024||p.split('\\').some((part,i,parts)=>i>0&&(!part&&(i!==parts.length-1||p.length!==3)||part==='.'||part==='..'||/[ .]$/.test(part))))throw Error(label+'包含无效的目录片段')
 return path.win32.normalize(p)
}
export function isValidJunctionName(name:string){
 return name.length>0&&name.length<=120&&name!=='.'&&name!=='..'&&!/[\\/:*?"<>|\x00-\x1F]/.test(name)&&!/[ .]$/.test(name)&&!reserved.test(name)
}
function existingDirectory(value:string,label:string){
 const p=localAbsolute(value,label)
 const s=fs.statSync(p,{throwIfNoEntry:false})
 if(!s?.isDirectory())throw Error(label+'不存在或不是文件夹')
 return {path:p,real:fs.realpathSync.native(p)}
}
function isUnder(candidate:string,root:string){
 const relation=path.win32.relative(root.toLowerCase(),candidate.toLowerCase())
 return relation===''||(!relation.startsWith('..\\')&&relation!=='..'&&!path.win32.isAbsolute(relation))
}
function prepareJunction(input:JunctionInput){
 const target=existingDirectory(input.target,'目标目录')
 const parent=existingDirectory(input.parent,'链接父目录')
 if(!isValidJunctionName(input.name))throw Error('链接名称包含无效字符或 Windows 保留名称')
 const linkPath=path.win32.join(parent.path,input.name)
 const resolvedLink=path.win32.join(parent.real,input.name)
 if(isUnder(resolvedLink,target.real))throw Error('链接不能创建在目标目录内部，以免产生目录循环')
 try{fs.lstatSync(linkPath);throw Error('链接路径已存在，请换一个名称（不会覆盖或移动现有文件）')}
 catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
 return {target:target.path,parent:parent.path,name:input.name,linkPath,targetReal:target.real}
}
export function previewJunction(input:JunctionInput):JunctionPreview{
 const linkPath=path.win32.join(input.parent.trim(),input.name.trim())
 try{
  const ready=prepareJunction(input)
  return {valid:true,target:ready.target,parent:ready.parent,name:ready.name,linkPath:ready.linkPath,reason:null}
 }catch(e){
  return {valid:false,target:input.target,parent:input.parent,name:input.name,linkPath,reason:e instanceof Error?e.message:String(e)}
 }
}
export function createJunction(input:JunctionInput):JunctionResult{
 const start=Date.now()
 const data=prepareJunction(input)
 try{fs.symlinkSync(data.target,data.linkPath,'junction')}
 catch(e){
  const err=e as NodeJS.ErrnoException
  if(err.code==='EEXIST')throw Error('链接路径已被占用，未覆盖已有文件')
  if(err.code==='EPERM'||err.code==='EACCES')throw Error('没有权限创建 Junction；请检查目录权限和文件系统是否支持 NTFS')
  throw e
 }
 const actual=fs.realpathSync.native(data.linkPath)
 if(actual.toLowerCase()!==data.targetReal.toLowerCase())throw Error('链接已创建，但最终目标验证异常；请人工检查该路径：'+data.linkPath)
 return {target:data.target,linkPath:data.linkPath,durationMs:Date.now()-start}
}
