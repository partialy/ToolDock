import {encodeBytesBase64,decodeImageBase64} from '../lib/image-encoding/base64-bytes'
import {detectImage,IMAGE_ENCODING_MAX_BYTES} from '../lib/image-encoding/format'
export type EncodingJob={id:number;kind:'encode';file:Blob;mode:'data-url'|'base64'}|{id:number;kind:'decode';text:string}
self.onmessage=async(event:MessageEvent<EncodingJob>)=>{
 const job=event.data
 try{
  if(job.kind==='encode'){
   if(job.file.size===0||job.file.size>IMAGE_ENCODING_MAX_BYTES)throw Error('图片必须大于 0 字节且不超过 20 MiB')
   const bytes=new Uint8Array(await job.file.arrayBuffer())
   const image=detectImage(bytes)
   const b64=encodeBytesBase64(bytes)
   const output=job.mode==='data-url'?'data:'+image.mime+';base64,'+b64:b64
   self.postMessage({id:job.id,ok:true,kind:'encode',output,image,size:bytes.length})
  }else{
   const {bytes,image}=decodeImageBase64(job.text)
   self.postMessage({id:job.id,ok:true,kind:'decode',buffer:bytes.buffer,image,size:bytes.length},[bytes.buffer])
  }
 }catch(e){self.postMessage({id:job.id,ok:false,error:e instanceof Error?e.message:String(e)})}
}
