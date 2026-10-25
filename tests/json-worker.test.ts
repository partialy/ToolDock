import {describe,it,expect,vi} from 'vitest'

describe('JSON Worker 消息与树形请求',()=>{
 it('解析、搜索、节点完整文本和修订号校验',async()=>{
  const sent:{id:number;ok:boolean;data?:unknown;error?:string}[]=[]
  const local={onmessage:undefined as unknown,postMessage:(data:unknown)=>sent.push(data as typeof sent[number])}
  vi.stubGlobal('self',local)
  try{
   await import('../src/workers/json.worker')
   const send=(id:number,revision:number,kind:string,rest:Record<string,unknown>={})=>{
    (local.onmessage as (event:{data:unknown})=>void)({data:{id,revision,kind,...rest}})
    return sent.at(-1)!
   }
   const text='{"user":{"name":"ToolDock","id":9007199254740993}}'
   const result=send(1,1,'parse',{source:text})
   expect(result.ok).toBe(true)
   expect((result.data as {valid:boolean}).valid).toBe(true)
   const roots=send(2,1,'children',{nodeId:'$'})
   const nodes=(roots.data as {nodes:{id:string;key:string}[]}).nodes
   expect(nodes[0].key).toBe('user')
   const matches=send(3,1,'search',{query:'ToolDock'})
   expect((matches.data as {nodes:unknown[]}).nodes.length).toBeGreaterThan(0)
   const id=(matches.data as {nodes:{id:string}[]}).nodes[0].id
   const copy=send(4,1,'node',{nodeId:id})
   expect(copy.data).toContain('ToolDock')
   expect(send(5,0,'children',{nodeId:'$'}).ok).toBe(false)
  }finally{vi.unstubAllGlobals()}
 })
})
