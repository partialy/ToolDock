import {spawn} from 'node:child_process'
export interface ProcessResult {stdout:string;stderr:string}
/** 参数始终为固定模板；媒体路径只能作为独立 argv，不经过 shell。 */
export function runProcess(file:string,args:string[],signal:AbortSignal,onOutput?:(text:string)=>void,timeoutMs=24*60*60*1000):Promise<ProcessResult>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(Error('任务已取消'));return}
  const child=spawn(file,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']})
  let stdout='',stderr='',settled=false,timedOut=false
  const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve({stdout,stderr})}
  const abort=()=>child.kill()
  const timer=setTimeout(()=>{timedOut=true;child.kill()},timeoutMs)
  signal.addEventListener('abort',abort,{once:true})
  child.stdout.on('data',b=>{const text=b.toString();stdout=(stdout+text).slice(-4*1024*1024);onOutput?.(text)})
  child.stderr.on('data',b=>{const text=b.toString();stderr=(stderr+text).slice(-65536);onOutput?.(text)})
  child.on('error',e=>finish(e))
  child.on('close',code=>finish(signal.aborted?Error('任务已取消'):timedOut?Error('媒体处理超时'):code===0?undefined:Error('处理引擎退出（'+code+'）：'+stderr.slice(-1800))))
 })
}
