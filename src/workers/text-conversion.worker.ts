import {conversionPreferencesSchema} from '../shared/textConversionModels'
import {convertContent} from '../lib/text-conversion/conversion-core'
self.onmessage=(event:MessageEvent<{id:number;text:string;settings:unknown}>)=>{
 const {id,text,settings}=event.data
 try{
  if(text.length>2_000_000)throw Error('文本输入超过 200 万字符，请使用下方文件转换')
  const prefs=conversionPreferencesSchema.parse(settings)
  const result=convertContent(text,'txt',prefs)
  self.postMessage({id,result})
 }catch(e){self.postMessage({id,error:e instanceof Error?e.message:String(e)})}
}
