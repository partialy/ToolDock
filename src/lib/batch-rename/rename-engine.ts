import type {
 AffixTrimStepOptions,
 ExtensionPolicy,
 NormalizeStepOptions,
 RenameFileEntry,
 RenameStep,
 ReplaceStepOptions,
 TemplateStepOptions
} from '../../shared/batchRenameModels'

export type RenameSortBy='manual'|'name'|'mtime'|'size'|'ext'
export type RenameSortDir='asc'|'desc'

export interface RenamePreviewRow{
 entry:RenameFileEntry
 checked:boolean
 targetName:string
 changed:boolean
 status:'unchanged'|'ready'|'conflict'|'invalid'
 message?:string
}

export interface RenamePreviewResult{
 rows:RenamePreviewRow[]
 stats:{
  total:number
  checked:number
  changed:number
  unchanged:number
  conflicts:number
  invalid:number
 }
 stepErrors:Record<string,string>
 canExecute:boolean
}

const naturalCollator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'})
const WINDOWS_FORBIDDEN=/[<>:"/\\|?*\x00-\x1F]/
const WINDOWS_RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

function escapeRegex(value:string):string{
 return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
}

export function formatRenameDate(mtimeMs:number,format:'YYYYMMDD'|'YYYY-MM-DD'):string{
 const d=new Date(Number.isFinite(mtimeMs)?mtimeMs:0)
 const y=String(d.getFullYear())
 const m=String(d.getMonth()+1).padStart(2,'0')
 const day=String(d.getDate()).padStart(2,'0')
 return format==='YYYY-MM-DD'?`${y}-${m}-${day}`:`${y}${m}${day}`
}

export function sortRenameEntries(entries:RenameFileEntry[],sortBy:RenameSortBy,sortDir:RenameSortDir):RenameFileEntry[]{
 if(sortBy==='manual')return [...entries]
 const dir=sortDir==='asc'?1:-1
 return [...entries].sort((a,b)=>{
  let cmp=0
  if(sortBy==='name')cmp=naturalCollator.compare(a.name,b.name)
  else if(sortBy==='mtime')cmp=a.mtimeMs-b.mtimeMs
  else if(sortBy==='size')cmp=a.size-b.size
  else if(sortBy==='ext')cmp=naturalCollator.compare(a.ext,b.ext)||naturalCollator.compare(a.name,b.name)
  return cmp!==0?cmp*dir:naturalCollator.compare(a.path,b.path)*dir
 })
}

export function validateWindowsFileName(name:string):string|null{
 if(!name||!name.trim())return '文件名不能为空'
 if(name.length>255)return '文件名超过 255 个字符'
 if(WINDOWS_FORBIDDEN.test(name))return '包含 Windows 非法字符 <>:"/\\|?*'
 if(/[. ]$/.test(name))return '文件名不能以空格或点结尾'
 if(WINDOWS_RESERVED.test(name))return '不能使用 Windows 系统保留文件名'
 return null
}

function toTitleCase(input:string):string{
 return input.replace(/\b([a-zA-Z])([a-zA-Z]*)/g,(_,head:string,tail:string)=>head.toUpperCase()+tail.toLowerCase())
}

function applyTemplateStep(stem:string,entry:RenameFileEntry,sequenceIndex:number,opt:TemplateStepOptions):string{
 const isSkippedFirst=opt.skipFirstNumber&&sequenceIndex===0
 const tpl=isSkippedFirst?(opt.firstTemplate||'{name}'):(opt.template||'{name}')
 const numIndex=opt.skipFirstNumber?Math.max(0,sequenceIndex-1):sequenceIndex
 const numberValue=opt.startNumber+numIndex*opt.step
 const numStr=String(numberValue).padStart(Math.max(1,opt.padWidth),'0')
 const dateStr=formatRenameDate(entry.mtimeMs,opt.dateFormat)
 const tokens:Record<string,string>={
  '{name}':stem,
  '{number}':numStr,
  '{date}':dateStr,
  '{parent}':entry.parentName
 }
 return tpl.replace(/\{name\}|\{number\}|\{date\}|\{parent\}/g,token=>tokens[token]??token)
}

function applyReplaceStep(stem:string,opt:ReplaceStepOptions):{stem:string;error?:string}{
 if(!opt.search)return {stem}
 if(opt.useRegex){
  try{
   const flags=(opt.replaceAll?'g':'')+(opt.caseSensitive?'':'i')
   const re=new RegExp(opt.search,flags)
   return {stem:stem.replace(re,opt.replaceWith)}
  }catch(e){
   return {stem,error:e instanceof Error?e.message:'正则表达式无效'}
  }
 }
 if(opt.caseSensitive){
  if(opt.replaceAll)return {stem:stem.split(opt.search).join(opt.replaceWith)}
  const idx=stem.indexOf(opt.search)
  return {stem:idx>=0?stem.slice(0,idx)+opt.replaceWith+stem.slice(idx+opt.search.length):stem}
 }
 const flags=(opt.replaceAll?'g':'')+'i'
 const re=new RegExp(escapeRegex(opt.search),flags)
 return {stem:stem.replace(re,()=>opt.replaceWith)}
}

function applyAffixTrimStep(stem:string,opt:AffixTrimStepOptions):string{
 let next=stem
 if(opt.trimStart>0||opt.trimEnd>0){
  const chars=Array.from(next)
  const end=Math.max(opt.trimStart,chars.length-opt.trimEnd)
  next=chars.slice(opt.trimStart,end).join('')
 }
 return `${opt.prefix}${next}${opt.suffix}`
}

function applyNormalizeStep(stem:string,opt:NormalizeStepOptions):string{
 let next=stem
 if(opt.stripTrailingIndex){
  next=next.replace(/(?:\s*[（(]\d+[)）]|[_-]\d+)$/,'')
 }
 if(opt.trimWhitespace)next=next.trim()
 if(opt.collapseSpaces)next=next.replace(/\s{2,}/g,' ')
 if(opt.caseMode==='lower')next=next.toLowerCase()
 else if(opt.caseMode==='upper')next=next.toUpperCase()
 else if(opt.caseMode==='title')next=toTitleCase(next)
 return next
}

export function applyExtensionPolicy(ext:string,policy:ExtensionPolicy):string{
 if(policy.mode==='keep')return ext
 if(policy.mode==='lower')return ext.toLowerCase()
 if(policy.mode==='upper')return ext.toUpperCase()
 const cleaned=policy.customExt.trim()
 if(!cleaned)return ''
 return cleaned.startsWith('.')?cleaned:`.${cleaned}`
}

/**
 * 在纯内存中对文件列表依次应用启用的重命名规则步骤与扩展名策略，并检测非法文件名与目录内冲突。
 */
export function previewBatchRename(
 entries:RenameFileEntry[],
 checkedIds:ReadonlySet<string>,
 steps:RenameStep[],
 extPolicy:ExtensionPolicy
):RenamePreviewResult{
 const stepErrors:Record<string,string>={}
 let sequenceIndex=0
 const rawRows=entries.map(entry=>{
  const checked=checkedIds.has(entry.id)
  if(!checked){
   return {entry,checked:false,targetName:entry.name,changed:false,invalidMsg:null as string|null}
  }
  let stem=entry.stem
  for(const step of steps){
   if(!step.enabled)continue
   if(step.kind==='template'){
    stem=applyTemplateStep(stem,entry,sequenceIndex,step.options as TemplateStepOptions)
   }else if(step.kind==='replace'){
    const res=applyReplaceStep(stem,step.options as ReplaceStepOptions)
    if(res.error&&!stepErrors[step.id])stepErrors[step.id]=res.error
    stem=res.stem
   }else if(step.kind==='affix-trim'){
    stem=applyAffixTrimStep(stem,step.options as AffixTrimStepOptions)
   }else if(step.kind==='normalize'){
    stem=applyNormalizeStep(stem,step.options as NormalizeStepOptions)
   }
  }
  sequenceIndex++
  const ext=applyExtensionPolicy(entry.ext,extPolicy)
  const targetName=`${stem}${ext}`
  const changed=targetName!==entry.name
  const invalidMsg=changed?validateWindowsFileName(targetName):null
  return {entry,checked:true,targetName,changed,invalidMsg}
 })

 const bucket=new Map<string,number>()
 for(const row of rawRows){
  const key=`${row.entry.dir.toLowerCase()}\\${row.targetName.toLowerCase()}`
  bucket.set(key,(bucket.get(key)||0)+1)
 }

 let changed=0,unchanged=0,conflicts=0,invalid=0
 const rows:RenamePreviewRow[]=rawRows.map(row=>{
  if(!row.checked){
   return {entry:row.entry,checked:false,targetName:row.targetName,changed:false,status:'unchanged'}
  }
  if(row.invalidMsg){
   invalid++
   return {entry:row.entry,checked:true,targetName:row.targetName,changed:row.changed,status:'invalid',message:row.invalidMsg}
  }
  const key=`${row.entry.dir.toLowerCase()}\\${row.targetName.toLowerCase()}`
  if((bucket.get(key)||0)>1){
   conflicts++
   return {entry:row.entry,checked:true,targetName:row.targetName,changed:row.changed,status:'conflict',message:'同目录下存在重名冲突'}
  }
  if(!row.changed){
   unchanged++
   return {entry:row.entry,checked:true,targetName:row.targetName,changed:false,status:'unchanged'}
  }
  changed++
  return {entry:row.entry,checked:true,targetName:row.targetName,changed:true,status:'ready'}
 })

 const hasStepErrors=Object.keys(stepErrors).length>0
 return {
  rows,
  stats:{
   total:entries.length,
   checked:rows.filter(r=>r.checked).length,
   changed,
   unchanged,
   conflicts,
   invalid
  },
  stepErrors,
  canExecute:!hasStepErrors&&changed>0&&conflicts===0&&invalid===0
 }
}
