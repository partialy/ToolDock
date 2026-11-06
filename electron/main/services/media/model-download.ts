import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {createHash} from 'node:crypto'
import type {DownloadState} from '../../../../src/shared/mediaModels'
import {fetchDownloadResponse} from './download-http'

export async function sha256(file:string,signal?:AbortSignal){const hash=createHash('sha256');for await(const bytes of createReadStream(file)){if(signal?.aborted)throw Error('下载已暂停');hash.update(bytes)}return hash.digest('hex')}
type Asset={id:string;url:string;bytes:number;sha256:string}
type Segment={start:number;end:number;next:number;done:boolean}
type Metadata={hash:string;etag:string;size:number;segments:Segment[]}
type DownloadOptions={acceleration:boolean;segments:number;signal:AbortSignal;update:(state:DownloadState)=>void;timing?:{headerMs?:number;idleMs?:number;retryMs?:number;checkpointBytes?:number;checkpointMs?:number}}
const aborted=(signal:AbortSignal)=>{if(signal.aborted)throw Error('下载已暂停')}
function range(value:string|null){const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(value||'');return m?m.slice(1).map(Number):null}
class RangeMismatch extends Error{}
function parseMetadata(raw:unknown,asset:Asset):Metadata|null{
 if(!raw||typeof raw!=='object')return null
 const m=raw as Metadata
 if(m.hash!==asset.sha256||m.size!==asset.bytes||typeof m.etag!=='string'||!m.etag||m.etag.startsWith('W/')||!Array.isArray(m.segments)||m.segments.length<1||m.segments.length>8)return null
 const segments:Segment[]=[];let expected=0
 for(const s of m.segments){
  if(!s||s.start!==expected||!Number.isSafeInteger(s.end)||s.end<s.start||s.end>=asset.bytes||typeof s.done!=='boolean')return null
  const next=s.next===undefined?(s.done?s.end+1:s.start):s.next
  if(!Number.isSafeInteger(next)||next<s.start||next>s.end+1||s.done!==(next===s.end+1))return null
  segments.push({start:s.start,end:s.end,next,done:next===s.end+1});expected=s.end+1
 }
 return expected===asset.bytes?{hash:m.hash,etag:m.etag,size:m.size,segments}:null
}
async function readMetadata(asset:Asset,destination:string){
 try{const stat=await fs.lstat(destination+'.part');if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==asset.bytes)return null;return parseMetadata(JSON.parse(await fs.readFile(destination+'.part.json','utf8')),asset)}catch{return null}
}
/** 只读取可验证边界的本地断点；远端版本仍须在恢复前重新核验。 */
export async function readDownloadProgress(asset:Asset,destination:string):Promise<number|null>{const m=await readMetadata(asset,destination);return m?m.segments.reduce((n,s)=>n+s.next-s.start,0):null}
async function pause(ms:number,signal:AbortSignal){
 aborted(signal)
 await new Promise<void>((resolve,reject)=>{const onAbort=()=>{clearTimeout(timer);reject(Error('下载已暂停'))};const timer=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve()},ms);signal.addEventListener('abort',onAbort,{once:true})})
}
async function publish(part:string,destination:string,signal:AbortSignal){
 aborted(signal)
 try{await fs.link(part,destination)}catch(error){if(!['EPERM','ENOTSUP','EXDEV','EOPNOTSUPP'].includes(String((error as NodeJS.ErrnoException).code)))throw error;await fs.copyFile(part,destination,2)}
 if(signal.aborted){await fs.unlink(destination).catch(()=>{});throw Error('下载已暂停')}
 await fs.unlink(part);await fs.unlink(part+'.json').catch(()=>{})
}

export async function downloadAsset(asset:Asset,destination:string,options:DownloadOptions){
 const part=destination+'.part',metaFile=part+'.json',signal=options.signal,timing=options.timing
 if(!Number.isSafeInteger(asset.bytes)||asset.bytes<1||!/^[a-f0-9]{64}$/.test(asset.sha256))throw Error('下载清单无效')
 if(await fs.lstat(destination).then(()=>true,()=>false))throw Error('目标模型文件已存在，未覆盖原文件')
 const partStat=await fs.lstat(part).catch(()=>null)
 if(partStat&&(!partStat.isFile()||partStat.isSymbolicLink()))throw Error('临时下载路径不是普通文件')
 let useProxy=options.acceleration,message='',received=0
 const update=(state:DownloadState['state'],error?:string)=>options.update({id:asset.id,state,received,total:asset.bytes,message,error})
 const prior=await readMetadata(asset,destination)
 if(partStat?.size===asset.bytes&&(!prior||prior.segments.every(s=>s.done))&&await sha256(part,signal)===asset.sha256){received=asset.bytes;update('verifying');await publish(part,destination,signal);update('completed');return}
 if(partStat&&!prior){message='旧临时文件无有效断点，重新下载';update('downloading')}
 const headerMs=timing?.headerMs??60000,idleMs=timing?.idleMs??60000,retryMs=timing?.retryMs??500
 const request=async(init:RequestInit={})=>{
  for(let attempt=0;;attempt++){
   aborted(signal);if(init.signal?.aborted)throw Error('并行下载已停止')
   const url=useProxy?'https://proxy-d.partialy.cn/?url='+encodeURIComponent(asset.url):asset.url
   try{
    const result=await fetchDownloadResponse(url,{...init,headers:{'Accept-Encoding':'identity',...init.headers}},signal,headerMs,idleMs)
    if(result.response.status>=500||result.response.status===403||result.response.status===429){await result.cancel();throw Error('下载服务器暂时不可用')}
    return result
   }catch(error){aborted(signal);if(init.signal?.aborted)throw error;if(attempt<2){await pause(retryMs*2**attempt,signal);continue}if(useProxy){useProxy=false;message='加速代理不可用，已回退直连';update('downloading');attempt=-1;continue}throw Error('连接下载服务器失败，请检查网络后继续下载')}
  }
 }
 update('downloading')
 try{const head=await request({method:'HEAD'});await head.cancel()}catch{aborted(signal)}
 let probe=await request({headers:{Range:'bytes=0-0'}})
 if(useProxy&&probe.response.status!==200&&probe.response.status!==206){await probe.cancel();useProxy=false;message='代理响应异常，已回退直连';update('downloading');probe=await request({headers:{Range:'bytes=0-0'}})}
 const r=range(probe.response.headers.get('content-range')),etag=probe.response.headers.get('etag')||''
 let supports=probe.response.status===206&&r?.[0]===0&&r[1]===0&&r[2]===asset.bytes&&Boolean(etag)&&!etag.startsWith('W/')&&(!probe.response.headers.has('content-length')||probe.response.headers.get('content-length')==='1')
 if(supports){let count=0;try{for await(const chunk of probe.chunks()){count+=chunk.byteLength;if(count>1)break}supports=count===1}catch{supports=false}}
 await probe.cancel()
 let metadata:Metadata
 if(supports&&prior?.etag===etag)metadata=prior
 else{
  if(prior){message='下载版本或范围信息已变化，安全重新下载';update('downloading')}
  const count=supports?Math.min(asset.bytes,Math.max(1,Math.min(8,options.segments))):1,chunk=Math.ceil(asset.bytes/count)
  const segments:Segment[]=[];for(let start=0;start<asset.bytes;start+=chunk)segments.push({start,end:Math.min(asset.bytes-1,start+chunk-1),next:start,done:false})
  metadata={hash:asset.sha256,etag:supports?etag:'',size:asset.bytes,segments}
 }
 const file=await fs.open(part,partStat?'r+':'wx');let save=Promise.resolve(),rangeFailed=false
 const total=()=>metadata.segments.reduce((n,s)=>n+s.next-s.start,0)
 const checkpoint=()=>{
  const work=save.then(async()=>{const snapshot=JSON.stringify(metadata);await file.sync();const manifest=await fs.open(metaFile+'.tmp','w');try{await manifest.writeFile(snapshot);await manifest.sync()}finally{await manifest.close()}await fs.rename(metaFile+'.tmp',metaFile)})
  save=work;return work
 }
 let group=new AbortController()
 try{
  await file.truncate(asset.bytes);await checkpoint();received=total();update('downloading')
  const runSegment=async(segment:Segment,ranged:boolean)=>{
   if(segment.done)return
   let retry=0,lastSaved=segment.next,lastSavedAt=Date.now()
   for(;;){
    aborted(signal);if(group.signal.aborted)throw Error('并行下载已停止')
    let connection:Awaited<ReturnType<typeof request>>|undefined
    try{
     if(!ranged){segment.next=segment.start;segment.done=false;received=total();await checkpoint()}
     const start=segment.next,length=segment.end-start+1,headers:Record<string,string>=ranged?{Range:`bytes=${start}-${segment.end}`,'If-Range':metadata.etag}:{}
     connection=await request({headers,signal:group.signal});const response=connection.response,cr=range(response.headers.get('content-range'))
     const encoding=response.headers.get('content-encoding')
     if(encoding&&encoding.toLowerCase()!=='identity')throw new RangeMismatch('服务器返回压缩响应，无法安全按字节续传')
     if(ranged?(response.status!==206||!cr||cr[0]!==start||cr[1]!==segment.end||cr[2]!==asset.bytes||response.headers.get('etag')!==metadata.etag):response.status!==200)throw new RangeMismatch('服务器返回不匹配的数据范围或版本')
     const lengthHeader=response.headers.get('content-length');if(lengthHeader&&Number(lengthHeader)!==length)throw new RangeMismatch('下载响应长度不匹配')
     for await(const chunk of connection.chunks()){
      aborted(signal);aborted(group.signal);if(segment.next+chunk.byteLength>segment.end+1)throw new RangeMismatch('下载数据超出范围')
      let offset=0;while(offset<chunk.byteLength){const written=await file.write(chunk,offset,chunk.byteLength-offset,segment.next+offset);if(!written.bytesWritten)throw Error('磁盘未能写入下载数据');offset+=written.bytesWritten}
      segment.next+=chunk.byteLength;segment.done=segment.next===segment.end+1;received=total();update('downloading')
      if(segment.next-lastSaved>=(timing?.checkpointBytes??1024*1024)||Date.now()-lastSavedAt>=(timing?.checkpointMs??1000)){await checkpoint();lastSaved=segment.next;lastSavedAt=Date.now()}
     }
     if(segment.next!==segment.end+1)throw Error('下载连接提前中断')
     segment.done=true;await checkpoint();return
    }catch(error){
     await connection?.cancel();await checkpoint();aborted(signal)
     if(error instanceof RangeMismatch){rangeFailed=true;group.abort();throw error}
     if(group.signal.aborted)throw error
     if(segment.next===segment.end+1){segment.done=true;return}
     if(retry++<2){await pause(retryMs*2**(retry-1),signal);continue}
     if(useProxy){useProxy=false;message='加速代理下载中断，已回退直连并保留断点';update('downloading');retry=0;continue}
     group.abort();throw Error('下载连接中断，已保存有效断点，请检查网络后继续下载')
    }finally{await connection?.cancel()}
   }
  }
  const results=await Promise.allSettled(metadata.segments.map(segment=>runSegment(segment,supports)))
  const failed=results.find(result=>result.status==='rejected')
  if(failed){
   if(rangeFailed&&!signal.aborted){
    message='服务器范围或版本校验未通过，已安全切换单连接重新下载';received=0;update('downloading');group=new AbortController()
    metadata={hash:asset.sha256,etag:'',size:asset.bytes,segments:[{start:0,end:asset.bytes-1,next:0,done:false}]};await checkpoint();await runSegment(metadata.segments[0],false)
   }else if(failed.status==='rejected')throw failed.reason
  }
  await save;await file.sync()
 }finally{group.abort();await save.catch(()=>{});await file.close()}
 aborted(signal);update('verifying')
 if(await sha256(part,signal)!==asset.sha256){await fs.unlink(metaFile).catch(()=>{});throw Error('SHA-256 校验失败，已废弃断点，请重新下载')}
 await publish(part,destination,signal);update('completed')
}
