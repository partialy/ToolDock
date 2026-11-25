import {dialog,shell,type BrowserWindow} from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import {z} from 'zod'
import {mediaKindSchema,mediaPreferencesSchema,mediaPreferencesPatchSchema} from '../../../../src/shared/mediaModels'
import type {MediaService} from './media-service'

export function registerMediaIpc(register:(channel:string,fn:(payload:any)=>unknown)=>void,service:MediaService,getWindow:()=>BrowserWindow|null){
 const id=z.string().min(1).max(100),paths=z.array(z.string().min(1).max(4096)).max(1000)
 const window=()=>{const win=getWindow();if(!win)throw Error('窗口尚未就绪');return win}
 const pickDirectory=async()=>{const result=await dialog.showOpenDialog(window(),{properties:['openDirectory']});return result.canceled?null:result.filePaths[0]??null}
 register('media:status',()=>service.status())
 register('media:chooseFiles',async input=>{mediaKindSchema.parse(input);const r=await dialog.showOpenDialog(window(),{properties:['openFile','multiSelections'],filters:[{name:'音视频',extensions:['mp4','mkv','mov','avi','flv','webm','ts','mts','m2ts','mpg','mpeg','m4v','wmv','ogv','3gp','mp3','wav','flac','m4a','aac','ogg','opus','wma','aiff','aif']}]});return r.canceled?[]:r.filePaths})
 register('media:chooseFolder',pickDirectory)
 register('media:addSources',input=>{const v=z.strictObject({paths,kind:mediaKindSchema}).parse(input);return service.addSources(v.paths,v.kind)})
 register('media:start',input=>{const v=z.strictObject({ids:z.array(id).min(1).max(1000),preferences:mediaPreferencesSchema}).parse(input);return service.start(v.ids,v.preferences)})
 register('media:cancel',input=>service.cancel(id.parse(input)))
 register('media:retry',input=>service.retry(id.parse(input)))
 register('media:clearFinished',()=>service.clearFinished())
 register('media:setAudioTrack',input=>{const v=z.strictObject({id,index:z.number().int().nonnegative()}).parse(input);return service.setAudioTrack(v.id,v.index)})
 register('media:chooseOutputDirectory',pickDirectory)
 register('media:openOutput',async input=>{const task=service.getTask(id.parse(input));if(task.state!=='completed'||!task.outputPath)throw Error('输出尚未完成');await fs.access(task.outputPath);shell.showItemInFolder(task.outputPath)})
 register('media:preview',input=>service.preview(id.parse(input)))
 register('media:simplifySubtitle',input=>service.simplifySubtitle(id.parse(input)))
 register('media:exportSubtitle',async input=>{
  const taskId=id.parse(input),text=await service.preview(taskId),task=service.getTask(taskId)
  const result=await dialog.showSaveDialog(window(),{defaultPath:path.parse(task.name).name+'.srt',filters:[{name:'SRT字幕',extensions:['srt']}]})
  if(result.canceled||!result.filePath)return null
  // 原生保存窗负责覆盖确认；源媒体文件始终受保护。
  if(path.resolve(result.filePath).toLowerCase()===path.resolve(task.inputPath).toLowerCase())throw Error('不能覆盖原始媒体文件')
  await fs.writeFile(result.filePath,text);return result.filePath
 })
 register('media:setPreferences',input=>service.setPreferences(mediaPreferencesPatchSchema.parse(input)))
 register('media:chooseFfmpeg',async()=>{const r=await dialog.showOpenDialog(window(),{properties:['openFile'],filters:[{name:'FFmpeg',extensions:['exe']}]});if(r.canceled||!r.filePaths[0])return null;await service.setFfmpegOverride(r.filePaths[0]);return r.filePaths[0]})
 register('media:models:download',input=>service.models.download(id.parse(input)))
 register('media:models:pause',input=>service.models.pause(id.parse(input)))
 register('media:models:resume',input=>service.models.resume(id.parse(input)))
 register('media:models:cancel',input=>service.models.cancel(id.parse(input)))
 register('media:models:remove',input=>service.models.remove(id.parse(input)))
 register('media:models:import',async input=>{const reference=z.boolean().parse(input);const r=await dialog.showOpenDialog(window(),{properties:['openFile'],filters:[{name:'Whisper模型',extensions:['bin']}]});if(!r.canceled&&r.filePaths[0])await service.models.importFile(r.filePaths[0],reference)})
 register('media:models:chooseDirectory',pickDirectory)
 register('media:models:migrateDirectory',input=>{const v=z.strictObject({path:z.string().min(1).max(4096),move:z.boolean()}).parse(input);return service.models.migrateDirectory(v.path,v.move)})
 register('media:engines:installCuda',()=>service.models.installCuda())
 register('media:engines:removeCuda',()=>service.models.removeCuda())
}
