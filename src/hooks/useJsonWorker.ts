import {useCallback,useEffect,useMemo,useRef} from 'react'
import type {JsonDiagnostic} from '@/lib/json/parse'
import type {JsonAction,JsonIndent} from '@/lib/json/transform'
export type TreeNode={id:string;path:string;key:string;type:string;preview:string;count:number}
export type JsonReport={valid:boolean;diagnostics:JsonDiagnostic[];duplicates:JsonDiagnostic[];nodeCount:number;root:TreeNode|null}
export type TreePage={nodes:TreeNode[];total:number}
type Kind='parse'|'transform'|'children'|'search'|'node'
type Pending={resolve:(data:any)=>void;reject:(reason:Error)=>void}
export function useJsonWorker(){
 const context=useRef<{worker:Worker;waiting:Map<number,Pending>;serial:number}|null>(null)
 const boot=useCallback(()=>{
  const worker=new Worker(new URL('../workers/json.worker.ts',import.meta.url),{type:'module'})
  const waiting=new Map<number,Pending>()
  const ctx={worker,waiting,serial:0}
  worker.onmessage=(e:MessageEvent<{id:number;ok:boolean;data:unknown;error?:string}>)=>{
   const req=waiting.get(e.data.id)
   if(!req)return
   waiting.delete(e.data.id)
   if(e.data.ok)req.resolve(e.data.data)
   else req.reject(new Error(e.data.error||'JSON 处理失败'))
  }
  worker.onerror=()=>{for(const req of waiting.values())req.reject(new Error('JSON 工作线程异常'));waiting.clear()}
  context.current=ctx
  return ctx
 },[])
 useEffect(()=>{boot();return()=>{const ctx=context.current;if(ctx){ctx.worker.terminate();for(const r of ctx.waiting.values())r.reject(new Error('操作已取消'));ctx.waiting.clear();context.current=null}}},[boot])
 const run=useCallback((kind:Kind,revision:number,params:Record<string,unknown>={}):Promise<any>=>{
  const ctx=context.current||boot()
  const id=++ctx.serial
  return new Promise((resolve,reject)=>{
   ctx.waiting.set(id,{resolve,reject})
   ctx.worker.postMessage({id,kind,revision,...params})
  })
 },[boot])
 const cancel=useCallback(()=>{
  const ctx=context.current
  if(ctx){
   ctx.worker.terminate()
   for(const r of ctx.waiting.values())r.reject(new Error('操作已取消'))
   ctx.waiting.clear()
  }
  boot()
 },[boot])
 return useMemo(()=>({
  parse:(source:string,revision:number):Promise<JsonReport>=>{cancel();return run('parse',revision,{source})},
  transform:(action:JsonAction,source:string,revision:number,indent:JsonIndent):Promise<string>=>run('transform',revision,{action,source,indent}),
  children:(nodeId:string,revision:number,start=0):Promise<TreePage>=>run('children',revision,{nodeId,start}),
  search:(query:string,revision:number):Promise<{nodes:TreeNode[];total:number}>=>run('search',revision,{query}),
  node:(nodeId:string,revision:number,valueKind:'raw'|'display'='raw'):Promise<string>=>run('node',revision,{nodeId,valueKind}),
  cancel
 }),[cancel,run])
}
