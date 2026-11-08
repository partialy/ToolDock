import {dialog,shell,type BrowserWindow} from 'electron'
import fs from 'node:fs/promises'
import {z} from 'zod'
import {audioEditSchema,audioExportOptionsSchema} from '../../../../src/shared/audioEditingModels'
import type {AudioEditingService} from './audio-editing-service'

export function registerAudioEditingIpc(register:(channel:string,fn:(value:any)=>unknown)=>void,service:AudioEditingService,getWindow:()=>BrowserWindow|null){
 const id=z.uuid(),ids=z.array(id).min(1).max(100),paths=z.array(z.string().min(1).max(4096)).min(1).max(1000)
 const window=()=>{const w=getWindow();if(!w)throw Error('主窗口不可用');return w}
 register('audio:status',()=>service.status())
 register('audio:chooseFiles',async()=>{
  const result=await dialog.showOpenDialog(window(),{properties:['openFile','multiSelections'],filters:[{name:'视频及音频',extensions:['mp4','mkv','mov','avi','flv','webm','ts','mts','m2ts','mpg','mpeg','m4v','wmv','ogv','3gp','mp3','wav','flac','m4a','aac','ogg','opus','wma','aiff','aif']}]})
  return result.canceled?[]:result.filePaths
 })
 register('audio:add',(v:unknown)=>service.addSources(paths.parse(v)))
 register('audio:copy',(v:unknown)=>service.copy(id.parse(v)))
 register('audio:addTrack',(v:unknown)=>{const p=z.strictObject({id,index:z.number().int().nonnegative()}).parse(v);return service.addTrack(p.id,p.index)})
 register('audio:relink',async(v:unknown)=>{
  const projectId=id.parse(v)
  const result=await dialog.showOpenDialog(window(),{properties:['openFile'],title:'选择新的源媒体文件'})
  return result.canceled||!result.filePaths[0]?null:service.relink(projectId,result.filePaths[0])
 })
 register('audio:save',(v:unknown)=>{const x=z.strictObject({id,revision:z.number().int().positive(),edit:audioEditSchema,outputName:z.string().max(180)}).parse(v);return service.save(x.id,x.revision,x.edit,x.outputName)})
 register('audio:remove',(v:unknown)=>service.remove(ids.parse(v)))
 register('audio:setPreferences',(v:unknown)=>{const x=z.strictObject({cacheLimitBytes:z.number().int().optional(),outputDirectory:z.string().max(4096).optional()}).parse(v);return service.setPreferences(x)})
 register('audio:chooseDirectory',async()=>{const result=await dialog.showOpenDialog(window(),{properties:['openDirectory']});return result.canceled?null:result.filePaths[0]||null})
 register('audio:peaks',(v:unknown)=>{const x=z.strictObject({id,startUs:z.number().int().nonnegative(),endUs:z.number().int().positive(),count:z.number().int().min(40).max(4096)}).parse(v);return service.peaks(x.id,x.startUs,x.endUs,x.count)})
 register('audio:preview',(v:unknown)=>{const x=z.strictObject({id,edited:z.boolean()}).parse(v);return service.preview(x.id,x.edited)})
 register('audio:export',(v:unknown)=>{const x=z.strictObject({ids,options:audioExportOptionsSchema}).parse(v);return service.export(x.ids,x.options)})
 register('audio:retry',(v:unknown)=>service.retry(id.parse(v)))
 register('audio:cancel',(v:unknown)=>service.cancel(id.parse(v)))
 register('audio:open',async(v:unknown)=>{
  const job=service.getJob(id.parse(v))
  if(job.state!=='completed'||!job.outputPath)throw Error('导出文件尚未完成')
  await fs.access(job.outputPath);shell.showItemInFolder(job.outputPath)
 })
}
