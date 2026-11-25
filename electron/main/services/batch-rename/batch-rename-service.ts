import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {
 MAX_RENAME_FILES,
 MAX_SCAN_DEPTH,
 type RenameBatchReport,
 type RenameExecuteItem,
 type RenameFileEntry,
 type RenameInspectResult
} from '../../../../src/shared/batchRenameModels'
import {validateWindowsFileName} from '../../../../src/lib/batch-rename/rename-engine'

const IS_WINDOWS=process.platform==='win32'

function pathKey(targetPath:string):string{
 const resolved=path.resolve(targetPath)
 return IS_WINDOWS?resolved.toLowerCase():resolved
}

function assertLocalAbsolutePath(inputPath:string):string{
 if(!inputPath||inputPath.includes('\0'))throw Error('文件路径不合法')
 if(inputPath.startsWith('\\\\')||inputPath.startsWith('//'))throw Error('不支持网络 UNC 路径')
 if(!path.isAbsolute(inputPath))throw Error('仅支持本地绝对路径')
 return path.resolve(inputPath)
}

function splitFileName(name:string):{stem:string;ext:string}{
 const ext=path.extname(name)
 return {stem:ext?name.slice(0,name.length-ext.length):name,ext}
}

export class BatchRenameService{
 private busy=false
 private lastBatch:{from:string;to:string}[]=[]

 canUndo():boolean{
  return this.lastBatch.length>0
 }

 async inspectSources(rawPaths:string[],includeSubdirs:boolean):Promise<RenameInspectResult>{
  const entries:RenameFileEntry[]=[]
  const skipped:{path:string;reason:string}[]=[]
  const seen=new Set<string>()
  let truncated=false

  const pushSkipped=(p:string,reason:string)=>{
   if(skipped.length<100)skipped.push({path:p,reason})
  }

  const addFile=async(filePath:string)=>{
   if(entries.length>=MAX_RENAME_FILES){truncated=true;return}
   const key=pathKey(filePath)
   if(seen.has(key))return
   try{
    const stat=await fs.lstat(filePath)
    if(stat.isSymbolicLink()){pushSkipped(filePath,'已跳过符号链接');return}
    if(!stat.isFile()){pushSkipped(filePath,'不是常规文件');return}
    seen.add(key)
    const dir=path.dirname(filePath)
    const name=path.basename(filePath)
    const {stem,ext}=splitFileName(name)
    entries.push({
     id:randomUUID(),
     path:filePath,
     dir,
     name,
     stem,
     ext,
     size:stat.size,
     mtimeMs:stat.mtimeMs,
     parentName:path.basename(dir)
    })
   }catch(e){
    pushSkipped(filePath,e instanceof Error?e.message:'无法读取文件')
   }
  }

  const walkDir=async(dirPath:string,depth:number)=>{
   if(entries.length>=MAX_RENAME_FILES){truncated=true;return}
   let items
   try{
    items=await fs.readdir(dirPath,{withFileTypes:true})
   }catch(e){
    pushSkipped(dirPath,e instanceof Error?e.message:'无法读取目录')
    return
   }
   for(const item of items){
    if(entries.length>=MAX_RENAME_FILES){truncated=true;return}
    const full=path.join(dirPath,item.name)
    if(item.isSymbolicLink()){pushSkipped(full,'已跳过符号链接');continue}
    if(item.isFile()){
     await addFile(full)
    }else if(item.isDirectory()&&includeSubdirs&&depth<MAX_SCAN_DEPTH){
     await walkDir(full,depth+1)
    }
   }
  }

  for(const raw of rawPaths){
   if(entries.length>=MAX_RENAME_FILES){truncated=true;break}
   let resolved:string
   try{
    resolved=assertLocalAbsolutePath(raw)
   }catch(e){
    pushSkipped(raw,e instanceof Error?e.message:'无效路径')
    continue
   }
   try{
    const stat=await fs.lstat(resolved)
    if(stat.isSymbolicLink()){pushSkipped(resolved,'已跳过符号链接');continue}
    if(stat.isFile())await addFile(resolved)
    else if(stat.isDirectory())await walkDir(resolved,0)
    else pushSkipped(resolved,'不支持的项目类型')
   }catch(e){
    pushSkipped(resolved,e instanceof Error?e.message:'路径不存在或不可访问')
   }
  }

  return {entries,skipped,truncated}
 }

 async execute(items:RenameExecuteItem[]):Promise<RenameBatchReport>{
  if(this.busy)throw Error('正在执行重命名操作，请稍候')
  this.busy=true
  try{
   const pairs:{sourcePath:string;targetPath:string}[]=[]
   for(const item of items){
    const sourcePath=assertLocalAbsolutePath(item.sourcePath)
    const cleanTargetName=item.targetName
    const invalid=validateWindowsFileName(cleanTargetName)
    if(invalid)throw Error(`${cleanTargetName}：${invalid}`)
    if(cleanTargetName!==path.basename(cleanTargetName))throw Error('目标名称不能包含目录分隔符')
    const targetPath=path.join(path.dirname(sourcePath),cleanTargetName)
    if(sourcePath===targetPath)continue
    pairs.push({sourcePath,targetPath})
   }
   if(!pairs.length)throw Error('没有需要修改的文件名')
   await this.runTwoPhaseRename(pairs)
   this.lastBatch=pairs.map(p=>({from:p.targetPath,to:p.sourcePath}))
   return {renamedCount:pairs.length,canUndo:true}
  }finally{
   this.busy=false
  }
 }

 async undo():Promise<RenameBatchReport>{
  if(this.busy)throw Error('正在执行重命名操作，请稍候')
  if(!this.lastBatch.length)throw Error('没有可撤销的重命名记录')
  this.busy=true
  try{
   const pairs=this.lastBatch.map(x=>({sourcePath:x.from,targetPath:x.to}))
   await this.runTwoPhaseRename(pairs)
   this.lastBatch=[]
   return {renamedCount:pairs.length,canUndo:false}
  }finally{
   this.busy=false
  }
 }

 private async runTwoPhaseRename(pairs:{sourcePath:string;targetPath:string}[]){
  const sourceKeys=new Set<string>()
  const targetKeys=new Set<string>()
  const dirSet=new Set<string>()

  for(const pair of pairs){
   const sk=pathKey(pair.sourcePath)
   const tk=pathKey(pair.targetPath)
   if(sourceKeys.has(sk))throw Error(`源文件重复：${pair.sourcePath}`)
   if(targetKeys.has(tk))throw Error(`目标文件名冲突：${path.basename(pair.targetPath)}`)
   sourceKeys.add(sk)
   targetKeys.add(tk)
   dirSet.add(path.dirname(pair.sourcePath))
  }

  for(const pair of pairs){
   let stat
   try{
    stat=await fs.lstat(pair.sourcePath)
   }catch{
    throw Error(`源文件不存在或已被移动：${path.basename(pair.sourcePath)}`)
   }
   if(stat.isSymbolicLink()||!stat.isFile()){
    throw Error(`仅支持重命名常规本地文件：${path.basename(pair.sourcePath)}`)
   }
  }

  const dirEntries=new Map<string,Map<string,string>>()
  for(const dir of dirSet){
   const names=await fs.readdir(dir)
   const map=new Map<string,string>()
   for(const name of names){
    map.set(IS_WINDOWS?name.toLowerCase():name,path.join(dir,name))
   }
   dirEntries.set(dir,map)
  }

  // 检查目标是否与同目录内未参与本批改名的现有文件冲突
  for(const pair of pairs){
   const dir=path.dirname(pair.targetPath)
   const targetBase=path.basename(pair.targetPath)
   const lookup=IS_WINDOWS?targetBase.toLowerCase():targetBase
   const existingPath=dirEntries.get(dir)?.get(lookup)
   if(existingPath&&!sourceKeys.has(pathKey(existingPath))){
    throw Error(`目标已存在且未参与本批重命名：${targetBase}`)
   }
  }

  const staged:{sourcePath:string;tempPath:string;targetPath:string}[]=[]
  try{
   for(const pair of pairs){
    const tempPath=path.join(path.dirname(pair.sourcePath),`.__tooldock_rename_${randomUUID()}.tmp`)
    await fs.rename(pair.sourcePath,tempPath)
    staged.push({sourcePath:pair.sourcePath,tempPath,targetPath:pair.targetPath})
   }
  }catch(e){
   for(let i=staged.length-1;i>=0;i--){
    await fs.rename(staged[i].tempPath,staged[i].sourcePath).catch(()=>{})
   }
   throw Error(`准备重命名失败，已恢复原文件名：${e instanceof Error?e.message:String(e)}`)
  }

  const committed:{sourcePath:string;tempPath:string;targetPath:string}[]=[]
  try{
   for(const item of staged){
    await fs.rename(item.tempPath,item.targetPath)
    committed.push(item)
   }
  }catch(e){
   for(let i=committed.length-1;i>=0;i--){
    await fs.rename(committed[i].targetPath,committed[i].tempPath).catch(()=>{})
   }
   for(let i=staged.length-1;i>=0;i--){
    await fs.rename(staged[i].tempPath,staged[i].sourcePath).catch(()=>{})
   }
   throw Error(`写入新文件名失败，已全部回滚：${e instanceof Error?e.message:String(e)}`)
  }
 }
}
