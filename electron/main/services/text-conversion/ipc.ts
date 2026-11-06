import {dialog,type BrowserWindow} from 'electron'
import {z} from 'zod'
import {conversionEncodingSchema,conversionPreferencesPatchSchema} from '../../../../src/shared/textConversionModels'
import type {TextConversionService} from './text-conversion-service'

export function registerTextConversionIpc(register:(channel:string,fn:(payload:any)=>unknown)=>void,service:TextConversionService,window:()=>BrowserWindow|null){
 const id=z.uuid(),ids=z.array(id).max(100),paths=z.array(z.string().min(1).max(4096)).max(100)
 const win=()=>{const current=window();if(!current||current.isDestroyed())throw Error('窗口尚未就绪');return current}
 register('textConversion:status',()=>service.status())
 register('textConversion:chooseFiles',async()=>{
  const result=await dialog.showOpenDialog(win(),{title:'选择文本文件',properties:['openFile','multiSelections'],filters:[{name:'文本及字幕',extensions:['txt','md','srt','vtt','lrc']}]})
  return result.canceled?[]:result.filePaths
 })
 register('textConversion:chooseFolder',async()=>{
  const result=await dialog.showOpenDialog(win(),{title:'选择文本文件夹',properties:['openDirectory']})
  return result.canceled?null:result.filePaths[0]||null
 })
 register('textConversion:addSources',arg=>service.addSources(paths.parse(arg)))
 register('textConversion:start',arg=>{const v=z.strictObject({ids,force:z.boolean().default(false)}).parse(arg);return service.start(v.ids,v.force)})
 register('textConversion:cancel',arg=>service.cancel(id.parse(arg)))
 register('textConversion:remove',arg=>service.remove(ids.parse(arg)))
 register('textConversion:rename',arg=>{const v=z.strictObject({id,name:z.string().max(160)}).parse(arg);return service.rename(v.id,v.name)})
 register('textConversion:setEncoding',arg=>{const v=z.strictObject({id,encoding:conversionEncodingSchema}).parse(arg);return service.setEncoding(v.id,v.encoding)})
 register('textConversion:setPreferences',arg=>service.setPreferences(conversionPreferencesPatchSchema.parse(arg)))
 register('textConversion:preview',arg=>{const v=z.strictObject({id,side:z.enum(['source','result']),offset:z.number().int().nonnegative(),length:z.number().int().min(1).max(16000)}).parse(arg);return service.preview(v.id,v.side,v.offset,v.length)})
 register('textConversion:search',arg=>{const v=z.strictObject({id,side:z.enum(['source','result']),query:z.string().min(1).max(100),from:z.number().int().nonnegative().default(0)}).parse(arg);return service.search(v.id,v.side,v.query,v.from)})
 register('textConversion:saveOne',arg=>service.saveOne(id.parse(arg)))
 register('textConversion:saveSelected',arg=>service.saveSelected(ids.parse(arg)))
 register('textConversion:saveZip',arg=>service.saveZip(ids.parse(arg)))
}
