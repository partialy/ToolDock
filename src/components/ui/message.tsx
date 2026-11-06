import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import {createPortal} from 'react-dom'
import {AnimatePresence,motion} from 'motion/react'
import {AlertTriangle,Check,CheckCircle2,Copy,Info,LoaderCircle,X,XCircle} from 'lucide-react'
import {useMicroMotion} from './motion-preference'

export type MessageType='success'|'error'|'warning'|'info'|'loading'
export interface MessageOptions {duration?:number;closable?:boolean;copyable?:boolean;dedupeKey?:string;details?:string}
export interface MessageUpdate extends MessageOptions {content?:unknown;type?:MessageType}
export interface MessageHandle {close:()=>void;update:(content:unknown,options?:MessageOptions&{type?:MessageType})=>void}
type Item={id:number;type:MessageType;text:string;details:string;duration:number;closable:boolean;copyable:boolean;key:string;revision:number}
let items:Item[]=[],serial=0
const listeners=new Set<()=>void>()
const publish=()=>listeners.forEach(fn=>fn())
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}}
const snapshot=()=>items
const close=(id:number)=>{items=items.filter(item=>item.id!==id);publish()}
function detail(value:unknown):string{
 if(value instanceof Error)return value.stack||value.message
 if(typeof value==='string')return value
 if(value===undefined||value===null)return '操作失败，请重试'
 try{return JSON.stringify(value)||String(value)}catch{return String(value)}
}
/** 用户可见文本去除 Electron 包装；复制保留完整诊断。 */
export function messageText(value:unknown):string{
 let text=value instanceof Error?value.message:detail(value)
 text=text.replace(/^Error:\s*/,'').replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/,'').replace(/^(?:Error:\s*)+/,'').trim()
 return text||'操作失败，请重试'
}
function normalized(type:MessageType,content:unknown,options:MessageOptions):Omit<Item,'id'|'revision'>{
 const text=messageText(content),details=options.details??detail(content)
 return{type,text,details,duration:Math.max(0,Math.min(120000,options.duration??(type==='loading'?0:type==='error'?6500:3500))),closable:options.closable!==false,copyable:options.copyable!==false,key:options.dedupeKey??type+':'+details}
}
function handle(id:number):MessageHandle{return{close:()=>close(id),update:(content,options={})=>{
 const old=items.find(item=>item.id===id);if(!old)return
 const update=normalized(options.type??old.type,content,{closable:old.closable,copyable:old.copyable,...options})
 items=items.map(item=>item.id===id?{...update,id,revision:item.revision+1}:item);publish()
}}}
function show(type:MessageType,content:unknown,options:MessageOptions={}):MessageHandle{
 const value=normalized(type,content,options),existing=items.find(item=>item.key===value.key)
 if(existing){items=items.map(item=>item.id===existing.id?{...item,...value,revision:item.revision+1}:item);publish();return handle(existing.id)}
 const id=++serial;items=[...items.slice(-4),{...value,id,revision:0}];publish();return handle(id)
}
export const msg={
 success:(content:unknown,options?:MessageOptions)=>show('success',content,options),
 error:(content:unknown,options?:MessageOptions)=>show('error',content,options),
 warning:(content:unknown,options?:MessageOptions)=>show('warning',content,options),
 info:(content:unknown,options?:MessageOptions)=>show('info',content,options),
 loading:(content:unknown,options?:MessageOptions)=>show('loading',content,options),
 closeAll:()=>{items=[];publish()}
}
const icons={success:CheckCircle2,error:XCircle,warning:AlertTriangle,info:Info,loading:LoaderCircle}
const colors={success:'text-emerald-500',error:'text-rose-500',warning:'text-amber-500',info:'text-blue-500',loading:'text-[var(--muted)]'}
function MessageItem({item}:{item:Item}){
 const {off,reduced}=useMicroMotion(),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[copied,setCopied]=useState(false),[copyFailed,setCopyFailed]=useState(false)
 const remaining=useRef(item.duration),copyTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 useEffect(()=>{remaining.current=item.duration;setCopied(false);setCopyFailed(false)},[item.revision,item.duration])
 useEffect(()=>{
  if(!item.duration||hovered||focused)return
  const started=Date.now(),timer=setTimeout(()=>close(item.id),remaining.current)
  return()=>{clearTimeout(timer);remaining.current=Math.max(0,remaining.current-(Date.now()-started))}
 },[hovered,focused,item.id,item.revision,item.duration])
 useEffect(()=>()=>clearTimeout(copyTimer.current),[])
 const Icon=icons[item.type]
 const copy=async()=>{
  try{await navigator.clipboard.writeText(item.details);setCopied(true);setCopyFailed(false);clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setCopied(false),1800)}
  catch{setCopyFailed(true)}
 }
 return <motion.div layout={!off&&!reduced} initial={off?false:reduced?{opacity:0}:{opacity:0,y:-14,scale:.97}} animate={{opacity:1,y:0,scale:1}} exit={off?{opacity:0}:reduced?{opacity:0}:{opacity:0,y:-10,scale:.98}} transition={{duration:off?0:reduced?.08:.18}}
  onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setFocused(false)}}
  className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3.5 py-2.5 text-[var(--foreground)] shadow-lg">
  <Icon aria-hidden="true" size={18} className={'shrink-0 '+colors[item.type]+(item.type==='loading'&&!off&&!reduced?' animate-spin':'')}/>
  <span role={item.type==='error'?'alert':'status'} aria-live={item.type==='error'?'assertive':'polite'} aria-atomic="true" className="max-h-32 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words text-sm leading-5">{item.text}{copyFailed&&<span className="mt-1 block text-xs text-rose-500">复制失败，请检查剪贴板权限</span>}</span>
  {item.copyable&&<button type="button" aria-label={copied?'消息已复制':'复制消息详情'} title={copied?'已复制':'复制详情'} onClick={()=>void copy()} className="shrink-0 rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]">{copied?<Check size={14}/>:<Copy size={14}/>}</button>}
  {item.closable&&<button type="button" aria-label="关闭消息" title="关闭" onClick={()=>close(item.id)} className="shrink-0 rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"><X size={14}/></button>}
 </motion.div>
}
export function MsgViewport(){
 const current=useSyncExternalStore(subscribe,snapshot,snapshot)
 useEffect(()=>{
  const keyboard=(event:KeyboardEvent)=>{
   if(!event.altKey||!event.shiftKey||event.ctrlKey||event.metaKey)return
   const item=event.code==='KeyC'?[...items].reverse().find(value=>value.copyable):items.at(-1);if(!item)return
   if(event.code==='KeyX'&&item.closable){event.preventDefault();close(item.id)}
   if(event.code==='KeyC'&&item.copyable){event.preventDefault();void navigator.clipboard.writeText(item.details).then(()=>msg.success('消息详情已复制',{copyable:false}),()=>msg.warning('复制失败，请检查剪贴板权限',{copyable:false}))}
  }
  window.addEventListener('keydown',keyboard,true);return()=>window.removeEventListener('keydown',keyboard,true)
 },[])
 return createPortal(<div data-msg-viewport aria-live="polite" aria-label="操作消息，Alt Shift C 复制最新消息，Alt Shift X 关闭最新消息" className="pointer-events-none fixed left-1/2 top-16 z-[1000] flex w-max max-w-[min(620px,calc(100vw-24px))] -translate-x-1/2 flex-col items-center gap-2"><AnimatePresence initial={false}>{current.map(item=><MessageItem key={item.id} item={item}/>)}</AnimatePresence></div>,document.body)
}
