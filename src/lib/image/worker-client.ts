import type {Job,JobOutput} from '../../workers/image.worker'
export function runImageWorker(job:Job):{promise:Promise<JobOutput[]>;abort:()=>void}{
 if(typeof Worker==='undefined')throw Error('当前环境不支持图片处理 Worker')
 const worker=new Worker(new URL('../../workers/image.worker.ts',import.meta.url),{type:'module'})
 let reject!:(e:Error)=>void,settled=false
 const cleanup=()=>{if(!settled){settled=true;worker.terminate()}}
 const promise=new Promise<JobOutput[]>((resolve,rej)=>{
  reject=rej
  worker.onmessage=(e:MessageEvent<{ok:boolean;results?:JobOutput[];error?:string}>)=>{
   if(settled)return
   cleanup()
   if(e.data.ok&&e.data.results)resolve(e.data.results)
   else rej(Error(e.data.error||'Worker 处理失败'))
  }
  worker.onerror=e=>{if(settled)return;cleanup();rej(Error(e.message||'Worker 执行失败'))}
  worker.postMessage(job)
 })
 return {promise,abort:()=>{if(settled)return;cleanup();reject(Error('任务已取消'))}}
}
