import {useCallback,useEffect,useRef} from 'react'
import type {CodecStep} from '../shared/codecModels'
import type {RunResult} from '../lib/codec/execute'
export function useCodecWorker(){
 const ctx=useRef<{worker:Worker;reject:(e:Error)=>void}|null>(null)
 const serial=useRef(0)
 const cancel=useCallback(()=>{
  const old=ctx.current;ctx.current=null
  if(old){old.worker.terminate();old.reject(new Error('转换已取消'))}
 },[])
 useEffect(()=>()=>cancel(),[cancel])
 const run=useCallback((input:string,steps:CodecStep[],selectedStepId?:string)=>{
  cancel();const id=++serial.current
  return new Promise<RunResult>((resolve,reject)=>{
   const worker=new Worker(new URL('../workers/codec.worker.ts',import.meta.url),{type:'module'})
   ctx.current={worker,reject}
   worker.onmessage=(e:MessageEvent<{id:number;ok:boolean;result?:RunResult;error?:string}>)=>{
    if(!ctx.current||e.data.id!==id)return
    ctx.current=null;worker.terminate()
    if(e.data.ok&&e.data.result)resolve(e.data.result)
    else reject(new Error(e.data.error||'编解码失败'))
   }
   worker.onerror=()=>{if(ctx.current?.worker===worker){ctx.current=null;worker.terminate();reject(new Error('编解码工作线程异常'))}}
   worker.postMessage({id,revision:id,input,steps,selectedStepId})
  })
 },[cancel])
 return {run,cancel}
}
