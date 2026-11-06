/** 内置 fetch 的 AbortSignal 同时控制响应正文；头部超时不能延伸为整次下载限时。 */
export async function fetchDownloadResponse(url:string,init:RequestInit,signal:AbortSignal,headerTimeoutMs:number,idleTimeoutMs:number){
 const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal,...(init.signal?[init.signal]:[])])
 let timer:ReturnType<typeof setTimeout>|undefined
 let expired=false
 const pending=fetch(url,{...init,signal:combined}).then(response=>{if(expired){void response.body?.cancel().catch(()=>{});throw Error('连接或响应头等待超时')}return response})
 let response:Response
 try{response=await Promise.race([pending,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('连接或响应头等待超时'));controller.abort()},headerTimeoutMs)})])}finally{if(timer)clearTimeout(timer)}
 return{
  response,
  async cancel(){controller.abort();await response.body?.cancel().catch(()=>{})},
  async *chunks():AsyncGenerator<Uint8Array>{
   if(!response.body)throw Error('下载响应为空')
   const reader=response.body.getReader()
   try{
    while(true){
     if(combined.aborted)throw Error('下载已暂停')
     let readTimer:ReturnType<typeof setTimeout>|undefined,abortListener:()=>void=()=>{}
     const interrupted=new Promise<never>((_,reject)=>{
      abortListener=()=>reject(Error('下载已暂停'));combined.addEventListener('abort',abortListener,{once:true})
      readTimer=setTimeout(()=>{reject(Error('下载连接长时间未收到数据'));controller.abort()},idleTimeoutMs)
     })
     let result:ReadableStreamReadResult<Uint8Array>
     try{result=await Promise.race([reader.read(),interrupted])}finally{if(readTimer)clearTimeout(readTimer);combined.removeEventListener('abort',abortListener)}
     if(result.done)break
     if(result.value.byteLength)yield result.value
    }
   }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  }
 }
}
