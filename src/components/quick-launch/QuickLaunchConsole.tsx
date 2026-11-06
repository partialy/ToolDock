import {msg} from '@/components/ui/message'
import {useEffect,useRef,useState} from 'react'
import {Copy,Pause,Play,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
export function QuickLaunchConsole({output,truncated,outputSequence,onError}:{output:string;truncated:boolean;outputSequence?:number;onError:(v:string)=>void}){
 const [autoScroll,setAutoScroll]=useState(true),[clearCursor,setClearCursor]=useState<number|null>(null),[copied,setCopied]=useState(false),viewport=useRef<HTMLPreElement>(null)
 // Runner 累计 UTF-16 字符游标不随滚动缓冲截断回退，重复输出也不会误判为旧内容。
 const currentSequence=outputSequence??output.length
 const text=clearCursor===null?output:output.slice(Math.max(0,output.length-Math.max(0,currentSequence-clearCursor)))
 useEffect(()=>{if(autoScroll&&viewport.current)viewport.current.scrollTop=viewport.current.scrollHeight},[text,autoScroll])
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),1500);return()=>clearTimeout(timer)},[copied])
 return <section className="flex min-h-0 flex-1 flex-col"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold">控制台输出</h3><div className="flex gap-1"><Button size="sm" onClick={()=>setAutoScroll(v=>!v)}>{autoScroll?<Pause size={13}/>:<Play size={13}/>} {autoScroll?'暂停滚动':'自动滚动'}</Button><Button size="sm" onClick={()=>{void navigator.clipboard.writeText(text).then(()=>{setCopied(true);msg.success('已复制')}).catch(e=>onError(String(e)))}}><Copy size={13}/> {copied?'已复制':'复制'}</Button><Button size="sm" onClick={()=>setClearCursor(currentSequence)}><Trash2 size={13}/> 清空显示</Button></div></div>
  {truncated&&<p className="mb-2 text-xs text-amber-500">输出超过 2 MiB，较早内容已从内存丢弃。</p>}
  <pre ref={viewport} tabIndex={0} aria-label="任务输出" className="min-h-48 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-[11px] leading-5">{text||'暂无输出'}</pre>
 </section>
}
