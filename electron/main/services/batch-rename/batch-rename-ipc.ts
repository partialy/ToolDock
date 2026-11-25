import {dialog,type BrowserWindow} from 'electron'
import {z} from 'zod'
import {getDb} from '../../database/store'
import {
 createRenamePreset,
 duplicateRenamePreset,
 getRenamePreset,
 listRenamePresets,
 removeRenamePreset,
 updateRenamePreset
} from '../../database/rename-presets'
import {
 renameExecuteSchema,
 renameInspectSchema,
 renamePresetIdSchema,
 renamePresetInputSchema
} from '../../../../src/shared/batchRenameModels'
import type {BatchRenameService} from './batch-rename-service'

export function registerBatchRenameIpc(
 register:<T>(channel:string,fn:(arg:T)=>unknown|Promise<unknown>)=>void,
 service:BatchRenameService,
 getWindow:()=>BrowserWindow|null
){
 register('batchRename:chooseFiles',async()=>{
  const win=getWindow()
  if(!win)return []
  const res=await dialog.showOpenDialog(win,{title:'选择要重命名的文件',properties:['openFile','multiSelections']})
  return res.canceled?[]:res.filePaths
 })
 register('batchRename:chooseFolder',async()=>{
  const win=getWindow()
  if(!win)return null
  const res=await dialog.showOpenDialog(win,{title:'选择文件夹',properties:['openDirectory']})
  return res.canceled?null:res.filePaths[0]||null
 })
 register('batchRename:inspectSources',(a:unknown)=>{
  const q=renameInspectSchema.parse(a)
  return service.inspectSources(q.paths,q.includeSubdirs)
 })
 register('batchRename:execute',(a:unknown)=>service.execute(renameExecuteSchema.parse(a)))
 register('batchRename:undo',()=>service.undo())
 register('batchRename:canUndo',()=>service.canUndo())

 register('renamePresets:list',()=>listRenamePresets(getDb()))
 register('renamePresets:get',(a:unknown)=>getRenamePreset(getDb(),renamePresetIdSchema.parse(a)))
 register('renamePresets:create',(a:unknown)=>createRenamePreset(getDb(),renamePresetInputSchema.parse(a)))
 register('renamePresets:update',(a:unknown)=>{
  const p=z.strictObject({id:renamePresetIdSchema,expectedRevision:z.number().int().positive(),data:renamePresetInputSchema}).parse(a)
  return updateRenamePreset(getDb(),p.id,p.expectedRevision,p.data)
 })
 register('renamePresets:duplicate',(a:unknown)=>{
  const p=z.strictObject({id:renamePresetIdSchema,newName:z.string().max(80).optional()}).parse(a)
  return duplicateRenamePreset(getDb(),p.id,p.newName)
 })
 register('renamePresets:remove',(a:unknown)=>{
  const p=z.strictObject({id:renamePresetIdSchema,expectedRevision:z.number().int().positive().optional()}).parse(a)
  return removeRenamePreset(getDb(),p.id,p.expectedRevision)
 })
}
