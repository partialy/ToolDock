import fs from 'node:fs/promises'
import path from 'node:path'
import {constants} from 'node:fs'
import {randomUUID} from 'node:crypto'
import type {ConversionFormat} from '../../../../src/shared/textConversionModels'

const formats=new Set<ConversionFormat>(['txt','md','srt','vtt','lrc'])
const reserved=/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i
export const MAX_FILE=50*1024*1024,MAX_TOTAL=500*1024*1024,MAX_COUNT=100
export function validName(name:string,ext:string){
 const part=name.trim()
 if(!part||part.length>150||part!==name||/[<>:"/\\|?*\x00-\x1f]/.test(part)||/[. ]$/.test(part)||reserved.test(part))throw Error('输出文件名包含非法字符、保留名称或长度超限')
 if(part.toLowerCase().endsWith('.'+ext.toLowerCase()))throw Error('请只输入文件名，扩展名由应用保留')
 return part
}
export function extension(input:string):ConversionFormat{
 const ext=path.extname(input).slice(1).toLowerCase() as ConversionFormat
 if(!formats.has(ext))throw Error('仅支持 TXT、MD、SRT、VTT、LRC 文本文件')
 return ext
}
export interface FoundFile {path:string;size:number;mtimeMs:number;ino:number}
export async function scanFiles(paths:string[]){
 const files:FoundFile[]=[],skipped:{path:string;reason:string}[]=[],seen=new Set<string>()
 const add=async(file:string)=>{
  try{
   if(!path.isAbsolute(file))throw Error('文件路径必须为绝对路径')
   const link=await fs.lstat(file)
   if(link.isSymbolicLink()||!link.isFile())throw Error('不接受链接或非普通文件')
   extension(file)
   if(link.size>MAX_FILE)throw Error('单文件超过 50 MiB')
   const real=await fs.realpath(file)
   const key=process.platform==='win32'?real.toLowerCase():real
   if(seen.has(key))return
   seen.add(key)
   const stat=await fs.stat(real)
   if(files.length>=MAX_COUNT){if(skipped.length<500)skipped.push({path:file,reason:'单次最多保留 100 个有效文件'});return}
   files.push({path:real,size:stat.size,mtimeMs:stat.mtimeMs,ino:stat.ino})
  }catch(e){if(skipped.length<500)skipped.push({path:file,reason:e instanceof Error?e.message:'无法读取文件'})}
 }
 for(const input of paths.slice(0,MAX_COUNT)){
  if(!path.isAbsolute(input)){skipped.push({path:input,reason:'路径不是绝对路径'});continue}
  try{
   const s=await fs.lstat(input)
   if(s.isSymbolicLink())throw Error('不扫描符号链接或 Junction')
   if(s.isDirectory()){
    let scanned=0
    for await(const item of await fs.opendir(input)){
     if(++scanned>10000){skipped.push({path:input,reason:'目录超过 10000 项，已停止扫描'});break}
     if(item.isFile())await add(path.join(input,item.name))
    }
   }else await add(input)
  }catch(e){skipped.push({path:input,reason:e instanceof Error?e.message:'路径无法访问'})}
 }
 if(paths.length>MAX_COUNT)skipped.push({path:'批量导入',reason:'每次最多输入 100 个路径'})
 return {files,skipped}
}
export async function assertUnchanged(file:FoundFile){
 const s=await fs.lstat(file.path)
 if(!s.isFile()||s.isSymbolicLink()||s.size!==file.size||Math.abs(s.mtimeMs-file.mtimeMs)>1||(file.ino&&s.ino&&file.ino!==s.ino))throw Error('源文件已经改变，请移除任务后重新导入')
}
export async function publishExclusive(source:string,target:string,forbidden:string[],signal?:AbortSignal){
 const base=path.parse(target)
 for(let i=0;i<10000;i++){
  if(signal?.aborted)throw Error('导出已取消')
  const name=base.name+(i?' ('+i+')':'')+base.ext,final=path.join(base.dir,name)
  if(forbidden.some(p=>path.resolve(p).toLowerCase()===path.resolve(final).toLowerCase()))continue
  const tmp=path.join(base.dir,'.tooldock-text-'+randomUUID()+'.part')
  let staged=false
  try{
   await fs.copyFile(source,tmp,constants.COPYFILE_EXCL);staged=true
   const h=await fs.open(tmp,'r+');try{await h.sync()}finally{await h.close()}
   try{await fs.link(tmp,final)}catch(error){
    const code=(error as NodeJS.ErrnoException).code
    if(!['EPERM','EXDEV','ENOTSUP','EOPNOTSUPP','UNKNOWN'].includes(code||''))throw error
    await fs.copyFile(tmp,final,constants.COPYFILE_EXCL)
   }
   if(signal?.aborted){await fs.unlink(final);throw Error('导出已取消')}
   return final
  }catch(e){
   if((e as NodeJS.ErrnoException).code==='EEXIST')continue
   throw e
  }finally{if(staged)await fs.unlink(tmp).catch(()=>{})}
 }
 throw Error('同名文件过多，无法安全保存')
}
