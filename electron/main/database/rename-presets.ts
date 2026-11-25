import {randomUUID} from 'node:crypto'
import type Database from './sqlite'
import {
 MAX_RENAME_PRESETS,
 extensionPolicySchema,
 renamePresetIdSchema,
 renamePresetInputSchema,
 renameStepSchema,
 type ExtensionPolicy,
 type RenamePresetInput,
 type RenamePresetSaved,
 type RenamePresetSummary,
 type RenameStep
} from '../../../src/shared/batchRenameModels'
import {z} from 'zod'

type Row={
 id:string
 name:string
 description:string
 config_json:string
 revision:number
 created_at:string
 updated_at:string
}

const storedConfigSchema=z.strictObject({
 steps:z.array(renameStepSchema).max(20),
 extensionPolicy:extensionPolicySchema
})

function parseStoredConfig(raw:string):{steps:RenameStep[];extensionPolicy:ExtensionPolicy}{
 return storedConfigSchema.parse(JSON.parse(raw))
}

function toSaved(row:Row):RenamePresetSaved{
 const cfg=parseStoredConfig(row.config_json)
 renamePresetInputSchema.parse({name:row.name,description:row.description,...cfg})
 return {
  id:row.id,
  name:row.name,
  description:row.description,
  steps:cfg.steps,
  extensionPolicy:cfg.extensionPolicy,
  revision:row.revision,
  createdAt:row.created_at,
  updatedAt:row.updated_at
 }
}

function toSummary(row:Row):RenamePresetSummary{
 const cfg=parseStoredConfig(row.config_json)
 return {
  id:row.id,
  name:row.name,
  description:row.description,
  stepCount:cfg.steps.length,
  revision:row.revision,
  createdAt:row.created_at,
  updatedAt:row.updated_at
 }
}

export function listRenamePresets(db:Database):RenamePresetSummary[]{
 return (db.prepare('SELECT * FROM rename_presets ORDER BY updated_at DESC,id ASC').all() as unknown as Row[]).map(toSummary)
}

export function getRenamePreset(db:Database,id:string):RenamePresetSaved{
 const row=db.prepare('SELECT * FROM rename_presets WHERE id=?').get(renamePresetIdSchema.parse(id)) as unknown as Row|undefined
 if(!row)throw Error('重命名预设不存在')
 return toSaved(row)
}

export function createRenamePreset(db:Database,input:RenamePresetInput):RenamePresetSaved{
 const data=renamePresetInputSchema.parse(input)
 return db.transaction(()=>{
  const count=(db.prepare('SELECT COUNT(*) AS n FROM rename_presets').get() as {n:number}).n
  if(count>=MAX_RENAME_PRESETS)throw Error(`最多保存 ${MAX_RENAME_PRESETS} 份重命名预设`)
  const id=randomUUID(),now=new Date().toISOString()
  const configJson=JSON.stringify({steps:data.steps,extensionPolicy:data.extensionPolicy})
  db.prepare('INSERT INTO rename_presets(id,name,description,schema_version,config_json,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
   .run(id,data.name,data.description,1,configJson,1,now,now)
  return getRenamePreset(db,id)
 })()
}

export function updateRenamePreset(db:Database,id:string,expectedRevision:number,input:RenamePresetInput):RenamePresetSaved{
 renamePresetIdSchema.parse(id)
 const data=renamePresetInputSchema.parse(input)
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw Error('无效的预设版本')
 return db.transaction(()=>{
  const configJson=JSON.stringify({steps:data.steps,extensionPolicy:data.extensionPolicy})
  const change=db.prepare('UPDATE rename_presets SET name=?,description=?,config_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
   .run(data.name,data.description,configJson,new Date().toISOString(),id,expectedRevision)
  if(!change.changes)throw Error('预设已更新或删除，请重新加载或另存为')
  return getRenamePreset(db,id)
 })()
}

export function duplicateRenamePreset(db:Database,id:string,newName?:string):RenamePresetSaved{
 const old=getRenamePreset(db,id)
 return createRenamePreset(db,{
  name:newName?.trim()||`${old.name} 副本`.slice(0,80),
  description:old.description,
  steps:old.steps.map(s=>({...s,id:randomUUID()})),
  extensionPolicy:{...old.extensionPolicy}
 })
}

export function removeRenamePreset(db:Database,id:string,expectedRevision?:number):void{
 renamePresetIdSchema.parse(id)
 if(expectedRevision!==undefined&&(!Number.isSafeInteger(expectedRevision)||expectedRevision<1))throw Error('无效的预设版本')
 const sql=expectedRevision===undefined?'DELETE FROM rename_presets WHERE id=?':'DELETE FROM rename_presets WHERE id=? AND revision=?'
 const result=db.prepare(sql).run(...(expectedRevision===undefined?[id]:[id,expectedRevision]))
 if(!result.changes)throw Error('预设已更新或删除，请重新加载')
}
