import {afterEach,describe,expect,it,vi} from 'vitest'
import {fetchDownloadResponse} from '../electron/main/services/media/download-http'

afterEach(()=>vi.unstubAllGlobals())

describe('媒体下载超时行为',()=>{
 it('头部超时仅约束等待响应头，不会中途取消持续接收的数据',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{
   let timer:ReturnType<typeof setInterval>|undefined
   let sent=0
   return new Response(new ReadableStream<Uint8Array>({
    start(controller){
     timer=setInterval(()=>{
      controller.enqueue(new Uint8Array([++sent]))
      if(sent===5){clearInterval(timer);controller.close()}
     },15)
    },
    cancel(){if(timer)clearInterval(timer)}
   }),{status:200})
  }))
  const connection=await fetchDownloadResponse('https://example.com/model.bin',{},new AbortController().signal,20,90)
  const received:number[]=[]
  for await(const chunk of connection.chunks())received.push(...chunk)
  expect(received).toEqual([1,2,3,4,5])
 })
 it('连接超过空闲时间没有返回任何数据时及时失败，允许上层保存断点',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new ReadableStream<Uint8Array>({start(){}}),{status:200})))
  const connection=await fetchDownloadResponse('https://example.com/model.bin',{},new AbortController().signal,20,30)
  await expect((async()=>{for await(const _chunk of connection.chunks()){/* consume */}})()).rejects.toThrow('长时间未收到数据')
 })
 it('等待响应头超时后不继续悬挂请求',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init:RequestInit)=>new Promise<Response>((_,reject)=>{
   const signal=init.signal as AbortSignal
   signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})
  })))
  await expect(fetchDownloadResponse('https://example.com/model.bin',{},new AbortController().signal,20,40)).rejects.toThrow('等待超时')
 })
})
