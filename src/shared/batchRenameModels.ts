import {z} from 'zod'

export const MAX_RENAME_FILES=2000
export const MAX_SCAN_DEPTH=20
export const MAX_RENAME_STEPS=20
export const MAX_RENAME_PRESETS=200
export const MAX_PRESET_BYTES=64*1024

export const renameStepKinds=['template','replace','affix-trim','normalize'] as const
export type RenameStepKind=typeof renameStepKinds[number]

export type TemplateStepOptions={
 template:string
 startNumber:number
 step:number
 padWidth:number
 skipFirstNumber:boolean
 firstTemplate:string
 dateFormat:'YYYYMMDD'|'YYYY-MM-DD'
}

export type ReplaceStepOptions={
 search:string
 replaceWith:string
 useRegex:boolean
 caseSensitive:boolean
 replaceAll:boolean
}

export type AffixTrimStepOptions={
 prefix:string
 suffix:string
 trimStart:number
 trimEnd:number
}

export type NormalizeStepOptions={
 caseMode:'none'|'lower'|'upper'|'title'
 trimWhitespace:boolean
 collapseSpaces:boolean
 stripTrailingIndex:boolean
}

export type RenameStepOptions=
 |TemplateStepOptions
 |ReplaceStepOptions
 |AffixTrimStepOptions
 |NormalizeStepOptions

export interface RenameStep{
 id:string
 kind:RenameStepKind
 enabled:boolean
 options:RenameStepOptions
}

export type ExtensionMode='keep'|'lower'|'upper'|'custom'

export interface ExtensionPolicy{
 mode:ExtensionMode
 customExt:string
}

export interface RenamePresetInput{
 name:string
 description:string
 steps:RenameStep[]
 extensionPolicy:ExtensionPolicy
}

export interface RenamePresetSaved extends RenamePresetInput{
 id:string
 revision:number
 createdAt:string
 updatedAt:string
}

export type RenamePresetSummary=Omit<RenamePresetSaved,'steps'|'extensionPolicy'>&{
 stepCount:number
}

export interface RenameFileEntry{
 id:string
 path:string
 dir:string
 name:string
 stem:string
 ext:string
 size:number
 mtimeMs:number
 parentName:string
}

export interface RenameInspectResult{
 entries:RenameFileEntry[]
 skipped:{path:string;reason:string}[]
 truncated:boolean
}

export interface RenameExecuteItem{
 sourcePath:string
 targetName:string
}

export interface RenameBatchReport{
 renamedCount:number
 canUndo:boolean
}

const templateOptionsSchema=z.strictObject({
 template:z.string().max(160),
 startNumber:z.number().int().min(0).max(999999),
 step:z.number().int().min(1).max(10000),
 padWidth:z.number().int().min(1).max(12),
 skipFirstNumber:z.boolean(),
 firstTemplate:z.string().max(160),
 dateFormat:z.enum(['YYYYMMDD','YYYY-MM-DD'])
})

const replaceOptionsSchema=z.strictObject({
 search:z.string().max(300),
 replaceWith:z.string().max(300),
 useRegex:z.boolean(),
 caseSensitive:z.boolean(),
 replaceAll:z.boolean()
})

const affixTrimOptionsSchema=z.strictObject({
 prefix:z.string().max(120),
 suffix:z.string().max(120),
 trimStart:z.number().int().min(0).max(200),
 trimEnd:z.number().int().min(0).max(200)
})

const normalizeOptionsSchema=z.strictObject({
 caseMode:z.enum(['none','lower','upper','title']),
 trimWhitespace:z.boolean(),
 collapseSpaces:z.boolean(),
 stripTrailingIndex:z.boolean()
})

export const extensionPolicySchema=z.strictObject({
 mode:z.enum(['keep','lower','upper','custom']),
 customExt:z.string().max(30)
})

export const renameStepSchema=z.discriminatedUnion('kind',[
 z.strictObject({id:z.uuid(),kind:z.literal('template'),enabled:z.boolean(),options:templateOptionsSchema}),
 z.strictObject({id:z.uuid(),kind:z.literal('replace'),enabled:z.boolean(),options:replaceOptionsSchema}),
 z.strictObject({id:z.uuid(),kind:z.literal('affix-trim'),enabled:z.boolean(),options:affixTrimOptionsSchema}),
 z.strictObject({id:z.uuid(),kind:z.literal('normalize'),enabled:z.boolean(),options:normalizeOptionsSchema})
])

export const renamePresetInputSchema=z.strictObject({
 name:z.string().trim().min(1).max(80),
 description:z.string().max(500),
 steps:z.array(renameStepSchema).max(MAX_RENAME_STEPS),
 extensionPolicy:extensionPolicySchema
}).superRefine((p,ctx)=>{
 const ids=p.steps.map(s=>s.id)
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'步骤 ID 重复'})
 if(new TextEncoder().encode(JSON.stringify({schemaVersion:1,name:p.name,description:p.description,steps:p.steps,extensionPolicy:p.extensionPolicy})).length>MAX_PRESET_BYTES){
  ctx.addIssue({code:'custom',message:'预设配置超过 64 KiB 上限'})
 }
})

export const renamePresetIdSchema=z.uuid()

export const renameInspectSchema=z.strictObject({
 paths:z.array(z.string().min(1).max(4096)).min(1).max(MAX_RENAME_FILES),
 includeSubdirs:z.boolean()
})

export const renameExecuteSchema=z.array(z.strictObject({
 sourcePath:z.string().min(1).max(4096),
 targetName:z.string().min(1).max(255)
})).min(1).max(MAX_RENAME_FILES)

export const defaultExtensionPolicy:ExtensionPolicy={mode:'keep',customExt:''}

export function makeRenameStep(kind:RenameStepKind='template'):RenameStep{
 const defaults:Record<RenameStepKind,RenameStepOptions>={
  template:{
   template:'{name}_{number}',
   startNumber:1,
   step:1,
   padWidth:1,
   skipFirstNumber:false,
   firstTemplate:'{name}',
   dateFormat:'YYYYMMDD'
  },
  replace:{
   search:'',
   replaceWith:'',
   useRegex:false,
   caseSensitive:false,
   replaceAll:true
  },
  'affix-trim':{
   prefix:'',
   suffix:'',
   trimStart:0,
   trimEnd:0
  },
  normalize:{
   caseMode:'none',
   trimWhitespace:true,
   collapseSpaces:false,
   stripTrailingIndex:false
  }
 }
 return {
  id:crypto.randomUUID(),
  kind,
  enabled:true,
  options:{...defaults[kind]}
 }
}

export const renameKindLabels:Record<RenameStepKind,string>={
 template:'模板与序号',
 replace:'查找替换',
 'affix-trim':'前后缀与截取',
 normalize:'大小写与清洗'
}

export interface BatchRenameAPI{
 chooseFiles():Promise<string[]>
 chooseFolder():Promise<string|null>
 inspectSources(paths:string[],includeSubdirs:boolean):Promise<RenameInspectResult>
 execute(items:RenameExecuteItem[]):Promise<RenameBatchReport>
 undo():Promise<RenameBatchReport>
 canUndo():Promise<boolean>
 pathForDroppedFile(file:File):string
}

export interface RenamePresetsAPI{
 list():Promise<RenamePresetSummary[]>
 get(id:string):Promise<RenamePresetSaved>
 create(data:RenamePresetInput):Promise<RenamePresetSaved>
 update(id:string,expectedRevision:number,data:RenamePresetInput):Promise<RenamePresetSaved>
 duplicate(id:string,newName?:string):Promise<RenamePresetSaved>
 remove(id:string,expectedRevision?:number):Promise<void>
}
