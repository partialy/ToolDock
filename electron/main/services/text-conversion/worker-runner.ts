import path from 'node:path'
import {Worker} from 'node:worker_threads'
import type {ConversionEncoding,ConversionPreferences} from '../../../../src/shared/textConversionModels'

export interface ConversionWorkerOptions {
 inputPath:string
 outputPath:string
 settings:ConversionPreferences
 encoding:ConversionEncoding
 signal?:AbortSignal
 onWorker?:(worker:Worker)=>void
 onProgress?:(percent:number)=>void
}

export interface ConversionWorkerResult {encoding:string;bytes:number}

/** 启动独立简繁转换工作线程并等待转换完成或中断。 */
export function runConversionWorker(options:ConversionWorkerOptions):Promise<ConversionWorkerResult>{
 return new Promise((resolve,reject)=>{
  if(options.signal?.aborted){reject(new Error('转换已取消'));return}
  let settled=false,worker:Worker|undefined
  const cleanup=()=>{options.signal?.removeEventListener('abort',onAbort)}
  const finish=(error?:Error,value?:ConversionWorkerResult)=>{
   if(settled)return;settled=true;cleanup()
   if(error)reject(error);else resolve(value!)
  }
  const onAbort=()=>{void worker?.terminate();finish(new Error('转换已取消'))}
  options.signal?.addEventListener('abort',onAbort,{once:true})
  worker=new Worker(path.join(__dirname,'text-conversion-worker.js'),{
   workerData:{inputPath:options.inputPath,outputPath:options.outputPath,settings:options.settings,encoding:options.encoding},
   resourceLimits:{maxOldGenerationSizeMb:512}
  })
  options.onWorker?.(worker)
  worker.on('message',(message:{percent?:number;done?:boolean;error?:string;encoding?:string;bytes?:number})=>{
   if(message.error)finish(new Error(message.error))
   else if(message.done)finish(undefined,{encoding:message.encoding||'utf8',bytes:message.bytes||0})
   else if(message.percent!==undefined)options.onProgress?.(message.percent)
  })
  worker.on('error',error=>finish(error))
  worker.on('exit',code=>finish(new Error(code===0?'工作线程提前结束':'工作线程终止：'+code)))
 })
}
