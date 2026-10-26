import type {EncodingJob} from '../../workers/image-encoding.worker'
import type {DetectedImage} from './format'
export type EncodingOutput={kind:'encode';output:string;image:DetectedImage;size:number}|{kind:'decode';bytes:Uint8Array;image:DetectedImage;size:number}
export function startEncodingJob(job:EncodingJob):{promise:Promise<EncodingOutput>;cancel:()=>void}{
 const worker=new Worker(new URL('../../workers/image-encoding.worker.ts',import.meta.url),{type:'module'})
 let reject!:(reason:Error)=>void,settled=false
 const finish=()=>{settled=true;worker.terminate()}
 const promise=new Promise<EncodingOutput>((resolve,rej)=>{
  reject=rej
  worker.onerror=(e)=>{if(settled)return;finish();rej(Error(e.message||'编码 Worker 异常'))}
  worker.onmessage=(e:MessageEvent<{id:number;ok:boolean;kind?:string;output?:string;buffer?:ArrayBuffer;image?:DetectedImage;size?:number;error?:string}>)=>{
   if(settled||e.data.id!==job.id)return
   finish()
   const data=e.data
   if(!data.ok||!data.image||data.size===undefined){rej(Error(data.error||'编码失败'));return}
   if(data.kind==='encode'&&typeof data.output==='string'){resolve({kind:'encode',output:data.output,image:data.image,size:data.size});return}
   if(data.kind==='decode'&&data.buffer){resolve({kind:'decode',bytes:new Uint8Array(data.buffer),image:data.image,size:data.size});return}
   rej(Error('无效的编码结果'))
  }
  worker.postMessage(job)
 })
 return {promise,cancel:()=>{if(settled)return;finish();reject(Error('编码任务已取消'))}}
}
