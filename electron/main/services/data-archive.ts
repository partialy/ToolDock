import fs from 'node:fs'
import path from 'node:path'
import type AdmZip from 'adm-zip'

const runtime='tools/quick-launch/runtime'
const excluded=(name:string)=>name.toLowerCase()===runtime||name.toLowerCase().startsWith(runtime+'/')

/** 只归档普通文件，明确排除运行凭据，并拒绝跟随工具目录中的链接。 */
export function addDataFolder(zip:AdmZip,root:string,sub:'tools'|'outputs'){
 const start=path.join(root,sub)
 if(!fs.existsSync(start))return
 const walk=(absolute:string,relative:string)=>{
  if(excluded(relative))return
  const stat=fs.lstatSync(absolute)
  if(stat.isSymbolicLink())throw Error('备份不允许包含符号链接或 Junction，请先移走链接')
  if(stat.isDirectory()){
   zip.addFile(relative+'/',Buffer.alloc(0))
   for(const name of fs.readdirSync(absolute))walk(path.join(absolute,name),relative+'/'+name)
  }else if(stat.isFile())zip.addLocalFile(absolute,path.posix.dirname(relative),path.posix.basename(relative))
  else throw Error('备份目录包含非常规文件')
 }
 walk(start,sub)
}

/** 在解压之前核验全量集合，避免 Windows 别名、ADS、符号链接与旧任务凭据恢复。 */
export function validateDataArchive(entries:AdmZip.IZipEntry[]){
 if(entries.length>50000)throw Error('备份包含过多文件')
 const seen=new Set<string>();let total=0
 for(const entry of entries){
  const name=entry.entryName,trimmed=name.replace(/\/$/,''),segments=trimmed.split('/'),key=trimmed.toLowerCase()
  if(!trimmed||name.includes('\\')||segments.some(s=>!s||s==='.'||s==='..'||/[\x00-\x1f:]/.test(s)||/[. ]$/.test(s)||/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(s)))throw Error('备份中存在不安全的文件路径')
  if(seen.has(key))throw Error('备份包含重复或大小写冲突的文件路径')
  seen.add(key)
  const allowed=key==='manifest.json'||key==='tooldock.sqlite'||segments[0]==='tools'||segments[0]==='outputs'
  if(!allowed||excluded(key))throw Error('备份包含不允许恢复的文件或运行凭据')
  const unixType=(entry.attr>>>16)&0xf000
  if(unixType&&unixType!==0x8000&&unixType!==0x4000)throw Error('备份包含链接或特殊文件')
  if(!Number.isSafeInteger(entry.header.size)||entry.header.size<0||entry.header.size>1024**3)throw Error('备份文件过大')
  total+=entry.header.size
  if(total>4*1024**3)throw Error('备份解压总量超出 4 GiB 限制')
 }
 // 任一路径都不能同时作为文件和父目录使用。
 const files=new Set(entries.filter(e=>!e.isDirectory).map(e=>e.entryName.toLowerCase()))
 for(const key of seen){const parts=key.split('/');parts.pop();while(parts.length){if(files.has(parts.join('/')))throw Error('备份目录与文件冲突');parts.pop()}}
 if(!files.has('manifest.json')||!files.has('tooldock.sqlite'))throw Error('不支持的备份格式')
}
