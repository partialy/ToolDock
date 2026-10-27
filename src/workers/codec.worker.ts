/// <reference lib="webworker" />
import {runPipeline} from '../lib/codec/execute'
import type {CodecStep} from '../shared/codecModels'
type Request={id:number;revision:number;input:string;steps:CodecStep[];selectedStepId?:string}
self.onmessage=(e:MessageEvent<Request>)=>{
 const {id,revision,input,steps,selectedStepId}=e.data
 try{const result=runPipeline(input,steps,selectedStepId);self.postMessage({id,revision,ok:true,result})}
 catch(err){self.postMessage({id,revision,ok:false,error:err instanceof Error?err.message:'编码转换失败'})}
}
export {}
