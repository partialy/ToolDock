import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {createHash} from 'node:crypto'
import type {DownloadState} from '../../../../src/shared/mediaModels'

export async function sha256(file:string){const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex')}
type Asset={id:string;url:string;bytes:number;sha256:string}
type Metadata={hash:string;etag:string;size:number;segments:{start:number;end:number;done:boolean}[]}
function range(value:string|null){const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(value||'');return m?m.slice(1).map(Number):null}
const aborted=(signal:AbortSignal)=>{if(signal.aborted)throw Error('下载已暂停')}

/** Only complete, validated ranges are resumable. Partial chunks are overwritten on retry. */
export async function downloadAsset(asset:Asset,destination:string,options:{acceleration:boolean;segments:number;signal:AbortSignal;update:(state:DownloadState)=>void}){
 const part=destination+'.part',metaFile=part+'.json',signal=options.signal
 let useProxy=options.acceleration,message='',received=0
 const update=(state:DownloadState['state'],error?:string)=>options.update({id:asset.id,state,received,total:asset.bytes,message,error})
 const request=async(init:RequestInit={})=>{
  for(let attempt=0;;attempt++){
   aborted(signal)
   const url=useProxy?'https://proxy-d.partialy.cn/?url='+encodeURIComponent(asset.url):asset.url
   const timeout=AbortSignal.timeout(60000)
   try{
    const response=await fetch(url,{...init,headers:{'Accept-Encoding':'identity',...init.headers},signal:AbortSignal.any([signal,timeout,...(init.signal?[init.signal]:[])])})
    if(response.status>=500||response.status===403||response.status===429){await response.body?.cancel();throw Error('网络请求失败')}
    return response
   }catch(error){
    aborted(signal);if(init.signal?.aborted)throw Error('并行下载已停止')
    if(attempt<2){await new Promise(r=>setTimeout(r,250*2**attempt));continue}
    if(useProxy){useProxy=false;message='加速代理不可用，已回退直连';update('downloading');attempt=-1;continue}
    throw Error('下载失败，请检查网络后重试')
   }
  }
 }
 update('downloading')
 let head:Response|undefined
 try{head=await request({method:'HEAD'})}catch{aborted(signal)}
 await head?.body?.cancel()
 let probe=await request({headers:{Range:'bytes=0-0'}})
 if(useProxy&&probe.status!==200&&probe.status!==206){await probe.body?.cancel();useProxy=false;message='代理响应异常，已回退直连';update('downloading');probe=await request({headers:{Range:'bytes=0-0'}})}
 const r=range(probe.headers.get('content-range'))
 const etag=probe.headers.get('etag')||'',supports=probe.status===206&&r?.[0]===0&&r[1]===0&&r[2]===asset.bytes&&Boolean(etag)&&!etag.startsWith('W/')
 await probe.body?.cancel()
 let metadata:Metadata
 const prior=await fs.readFile(metaFile,'utf8').then(x=>JSON.parse(x) as Metadata).catch(()=>null)
 if(supports&&prior?.hash===asset.sha256&&prior.etag===etag&&prior.size===asset.bytes&&Array.isArray(prior.segments)&&await fs.stat(part).then(s=>s.size===asset.bytes).catch(()=>false))metadata=prior
 else{
  const count=supports?Math.max(1,Math.min(8,options.segments)):1,chunk=Math.ceil(asset.bytes/count)
  metadata={hash:asset.sha256,etag,size:asset.bytes,segments:Array.from({length:count},(_,i)=>({start:i*chunk,end:Math.min(asset.bytes-1,(i+1)*chunk-1),done:false}))}
  const file=await fs.open(part,'w');await file.truncate(asset.bytes);await file.close()
 }
 // Validate persisted boundaries before trusting the resume manifest.
 let expected=0;for(const s of metadata.segments){if(s.start!==expected||!Number.isSafeInteger(s.end)||s.end<s.start||s.end>=asset.bytes)throw Error('续传记录无效，请取消后重试');expected=s.end+1}if(expected!==asset.bytes)throw Error('续传记录不完整')
 received=metadata.segments.filter(s=>s.done).reduce((n,s)=>n+s.end-s.start+1,0)
 const file=await fs.open(part,'r+');let save=Promise.resolve(),rangeFailed=false;const group=new AbortController()
 try{
  const results=await Promise.allSettled(metadata.segments.map(async segment=>{
   if(segment.done)return
   for(let retry=0;;retry++){
    let written=0
    try{
     const headers:Record<string,string>=supports?{Range:`bytes=${segment.start}-${segment.end}`,'If-Range':metadata.etag}:{}
     const response=await request({headers,signal:group.signal}),contentRange=range(response.headers.get('content-range')),length=segment.end-segment.start+1
     if(supports?(response.status!==206||!contentRange||contentRange[0]!==segment.start||contentRange[1]!==segment.end||contentRange[2]!==asset.bytes||response.headers.get('etag')!==metadata.etag):(response.status!==200)){
      await response.body?.cancel();rangeFailed=true;throw Error('服务器返回不匹配的数据范围或版本')
     }
     const contentLength=response.headers.get('content-length');if(contentLength&&Number(contentLength)!==length){await response.body?.cancel();throw Error('下载长度不匹配')}
     if(!response.body)throw Error('下载响应为空')
     for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){aborted(signal);aborted(group.signal);if(written+chunk.byteLength>length)throw Error('下载数据超出范围');let offset=0;while(offset<chunk.byteLength){const w=await file.write(chunk,offset,chunk.byteLength-offset,segment.start+written+offset);offset+=w.bytesWritten}written+=chunk.byteLength;received+=chunk.byteLength;update('downloading')}
     if(written!==length)throw Error('下载数据不完整')
     segment.done=true;save=save.then(async()=>{await fs.writeFile(metaFile+'.tmp',JSON.stringify(metadata));await fs.rename(metaFile+'.tmp',metaFile)});await save;break
    }catch(error){received-=written;aborted(signal);if(group.signal.aborted)throw error;if(retry>=2){if(useProxy){useProxy=false;message='代理响应校验失败，已回退直连';update('downloading');retry=-1;continue}group.abort();throw error}}
   }
  }));const failed=results.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason
 }catch(error){
  await file.close()
  if(rangeFailed&&!signal.aborted){
   // A server that ignores Range must restart safely as a single complete stream.
   const response=await request();if(response.status!==200||!response.body){await response.body?.cancel();throw error}
   const serial=await fs.open(part,'w');received=0
   try{for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){aborted(signal);if(received+chunk.byteLength>asset.bytes)throw Error('服务器返回的数据超出模型大小');await serial.write(chunk);received+=chunk.byteLength;update('downloading')}if(received!==asset.bytes)throw Error('模型数据不完整')}finally{await serial.close()}
   await fs.unlink(metaFile).catch(()=>{})
  }else throw error
 }finally{await file.close().catch(()=>{})}
 aborted(signal);update('verifying')
 if(await sha256(part)!==asset.sha256)throw Error('SHA-256 校验失败，请取消后重新下载')
 aborted(signal)
 // Exclusive hard-link publication is atomic: no incomplete final model is visible.
 try{await fs.link(part,destination)}catch(error){
  if(!['EPERM','ENOTSUP','EXDEV','EOPNOTSUPP'].includes(String((error as NodeJS.ErrnoException).code)))throw error
  // FAT/exFAT cannot hard-link. COPYFILE_EXCL still guarantees no overwrite; the
  // service holds its mutation lock and never exposes this file as installed until verified.
  await fs.copyFile(part,destination,2)
  if(signal.aborted){await fs.unlink(destination).catch(()=>{});throw Error('下载已暂停')}
 }
 await fs.unlink(part);await fs.unlink(metaFile).catch(()=>{});update('completed')
}
