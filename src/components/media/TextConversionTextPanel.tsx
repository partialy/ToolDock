import {useEffect,useRef,useState} from 'react'
import {ArrowLeftRight,Copy,Languages,Play,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {msg} from '@/components/ui/message'
import type {ConversionPreferences} from '@/shared/textConversionModels'

export function TextConversionTextPanel({preferences}:{preferences:ConversionPreferences}){
 const [source,setSource]=useState(''),[result,setResult]=useState(''),[working,setWorking]=useState(false)
 const worker=useRef<Worker|null>(null),sequence=useRef(0)
 const ensureWorker=()=>{
  if(worker.current)return worker.current
  const current=new Worker(new URL('../../workers/text-conversion.worker.ts',import.meta.url),{type:'module'})
  worker.current=current
  current.onmessage=(event:MessageEvent<{id:number;result?:string;error?:string}>)=>{
   if(event.data.id!==sequence.current)return
   setWorking(false)
   if(event.data.error)msg.error(event.data.error)
   else{setResult(event.data.result||'');msg.success('文本转换完成')}
  }
  current.onerror=e=>{setWorking(false);msg.error('文本转换失败：'+e.message)}
  return current
 }
 useEffect(()=>()=>{worker.current?.terminate();worker.current=null},[])
 const convert=()=>{
  if(!source){msg.warning('请先输入文本');return}
  if(source.length>2_000_000){msg.warning('文本超过 200 万字符，请使用文件转换');return}
  setWorking(true);ensureWorker().postMessage({id:++sequence.current,text:source,settings:preferences})
 }
 const copy=async()=>{try{await navigator.clipboard.writeText(result);msg.success('已复制转换结果')}catch(e){msg.error(e)}}
 const clear=()=>{setSource('');setResult('');sequence.current++;setWorking(false)}
 const swap=()=>{setSource(result);setResult(source);sequence.current++;setWorking(false)}
 return <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 lg:p-5">
  <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Languages size={16} className="text-indigo-400"/><h2 className="text-sm font-semibold">文本转换</h2></div><div className="flex items-center gap-2"><Button size="sm" disabled={working} onClick={swap}><ArrowLeftRight size={14}/>交换</Button><Button size="sm" onClick={clear}><Trash2 size={14}/>清空</Button><Button size="sm" disabled={!result} onClick={()=>void copy()}><Copy size={14}/>复制结果</Button></div></div>
  <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
   <label className="flex min-w-0 flex-col gap-2 text-xs font-medium"><span>输入文本 <span className="font-normal muted">· {source.length} 字符</span></span><textarea value={source} onChange={e=>setSource(e.target.value)} placeholder="粘贴需要转换的中文内容..." spellCheck={false} className="h-52 min-w-0 resize-y rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 text-sm leading-6 outline-none focus:border-indigo-500"/></label>
   <div className="flex items-center justify-center"><Button variant="primary" disabled={working||!source} onClick={convert}><Play size={15}/>{working?'转换中…':'转换'}</Button></div>
   <label className="flex min-w-0 flex-col gap-2 text-xs font-medium"><span>转换结果 <span className="font-normal muted">· {result.length} 字符</span></span><textarea readOnly value={result} placeholder="转换后的内容将显示在这里" spellCheck={false} className="h-52 min-w-0 resize-y rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 text-sm leading-6 outline-none"/></label>
  </div>
 </section>
}
