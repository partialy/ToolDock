import {Zip,ZipPassThrough} from 'fflate'
/** Streams generated ZIP chunks to a backpressured sink, never assembles the entire ZIP in memory. */
export async function zipToSink(entries:{name:string;blob:Blob}[],sink:(chunk:Uint8Array)=>Promise<void>,isCancelled:()=>boolean=()=>false){
 let pending=Promise.resolve(),done=false,zipError:Error|null=null
 let finish!:()=>void,rejectFinish!:(e:Error)=>void
 const finished=new Promise<void>((resolve,reject)=>{finish=resolve;rejectFinish=reject})
 const zip=new Zip((error,chunk,final)=>{
  if(error){zipError=error;rejectFinish(error);return}
  pending=pending.then(async()=>{if(isCancelled())throw Error('导出已取消');await sink(chunk)})
  if(final){done=true;void pending.then(finish,rejectFinish)}
 })
 for(const file of entries){
  if(isCancelled())throw Error('导出已取消')
  const part=new ZipPassThrough(file.name);zip.add(part)
  const bytes=new Uint8Array(await file.blob.arrayBuffer())
  for(let i=0;i<bytes.length;i+=524288){if(isCancelled())throw Error('导出已取消');part.push(bytes.subarray(i,i+524288),i+524288>=bytes.length);await pending}
  if(bytes.length===0)part.push(new Uint8Array(0),true)
  await pending
 }
 zip.end()
 if(!done&&zipError)throw zipError
 await finished
}
