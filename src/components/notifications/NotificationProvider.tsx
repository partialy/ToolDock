import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {AnimatePresence,motion} from 'motion/react'
import {Bell,X,AlertTriangle,CheckCircle2,Info} from 'lucide-react'
import type {NotificationPosition} from '@/shared/fileTransferModels'
import {useMicroMotion} from '@/components/ui/motion-preference'
import {msg} from '@/components/ui/message'
type Level='info'|'success'|'warning'|'error'
type Item={id:number;title:string;description:string;level:Level;action?:()=>void;sticky:boolean;dedupeKey?:string}
type Push=(data:{title:string;description:string;level?:Level;action?:()=>void;sticky?:boolean;dedupeKey?:string})=>void
const Context=createContext<Push>(()=>{})
export const useNotification=()=>useContext(Context)
export function NotificationProvider({children,position,onOpenTransfer,previewPositionChanges=false}:{children:ReactNode;position:NotificationPosition;onOpenTransfer:()=>void;previewPositionChanges?:boolean}){
 const [items,setItems]=useState<Item[]>([])
 const counter=useRef(0),timers=useRef<Map<number,ReturnType<typeof setTimeout>>>(new Map())
 const lastPosition=useRef<NotificationPosition|null>(null)
 const lastTransferCounts=useRef<{files:number;messages:number}|null>(null)
 const {off,reduced}=useMicroMotion()
 const dismiss=useCallback((id:number)=>{setItems(a=>a.filter(t=>t.id!==id));const timer=timers.current.get(id);if(timer)clearTimeout(timer);timers.current.delete(id)},[])
 const push=useCallback<Push>(item=>{
  if(!item.action){msg[item.level||'info']([item.title,item.description].filter(Boolean).join('：'),{duration:item.sticky?0:undefined,dedupeKey:item.dedupeKey});return}
  const id=++counter.current
  setItems(prev=>{
   const old=item.dedupeKey?prev.find(v=>v.dedupeKey===item.dedupeKey):null
   if(old){const timer=timers.current.get(old.id);if(timer)clearTimeout(timer);timers.current.delete(old.id)}
   return [...prev.filter(v=>v.id!==old?.id).slice(-2),{id,...item,level:item.level||'info',sticky:Boolean(item.sticky)}]
  })
  if(!item.sticky&&item.level!=='error')timers.current.set(id,setTimeout(()=>dismiss(id),6000))
 },[dismiss])
 useEffect(()=>{
  const offPending=window.toolDock.transfer.onChange((data)=>{
   if(!data.running){lastTransferCounts.current=null;return}
   const next={files:data.pool.fileCount,messages:data.pool.messageCount},prior=lastTransferCounts.current
   if(prior&&next.files>prior.files)push({title:'文件池新增文件',description:'共享文件池新增 '+(next.files-prior.files)+' 个条目，可直接访问。',level:'info',action:onOpenTransfer,dedupeKey:'transfer-pool-new'})
   if(prior&&next.messages>prior.messages)push({title:'收到共享消息',description:'文字消息池新增 '+(next.messages-prior.messages)+' 条消息。',level:'info',dedupeKey:'transfer-message-new'})
   lastTransferCounts.current=next
  })
  const demo=(event:Event)=>push((event as CustomEvent<Parameters<Push>[0]>).detail)
  window.addEventListener('tooldock:toast',demo)
  return()=>{offPending();window.removeEventListener('tooldock:toast',demo)}
 },[push,onOpenTransfer])
 useEffect(()=>{
  if(!previewPositionChanges){lastPosition.current=null;return}
  if(lastPosition.current===null){lastPosition.current=position;return}
  if(lastPosition.current!==position){
   lastPosition.current=position
   push({title:'通知位置已更新',description:'文件快传等可操作提醒的位置已更新。',level:'info',dedupeKey:'notification-position-preview'})
  }
 },[position,previewPositionChanges,push])
 useEffect(()=>()=>{for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear()},[])
 const positions:Record<NotificationPosition,string>={
  'top-left':'top-16 left-4','top-right':'top-16 right-4',
  'bottom-left':'bottom-4 left-4','bottom-right':'bottom-4 right-4'
 }
 return <Context.Provider value={push}>{children}
  <div className={'pointer-events-none fixed z-[360] flex w-[min(390px,calc(100vw-32px))] flex-col gap-2 '+positions[position]} aria-label="ToolDock 通知">
   <AnimatePresence initial={false}>{items.map(item=><motion.div key={item.id}
    initial={off?false:reduced?{opacity:0}:{opacity:0,x:position.endsWith('right')?15:-15}}
    animate={{opacity:1,x:0}} exit={{opacity:0,x:off||reduced?0:position.endsWith('right')?12:-12}}
    transition={{duration:off?0:reduced?.08:.18}}
    role={item.level==='error'?'alert':'status'}
    className="pointer-events-none rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-xl">
     <div className="flex gap-2.5">
      <span className="mt-0.5 text-indigo-400">{item.level==='error'||item.level==='warning'?<AlertTriangle size={19}/>:item.level==='success'?<CheckCircle2 size={19}/>:item.level==='info'?<Info size={19}/>:<Bell size={19}/>}</span>
      <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{item.title}</div><p className="mt-1 break-words text-xs leading-5 muted">{item.description}</p>
       {item.action&&<button className="pointer-events-auto mt-2 text-xs font-medium text-indigo-400 hover:underline" onClick={()=>{item.action?.();dismiss(item.id)}}>打开文件快传</button>}
      </div>
      <button aria-label="关闭通知" className="pointer-events-auto self-start rounded-lg p-1 hover:bg-[var(--hover)]" onClick={()=>dismiss(item.id)}><X size={15}/></button>
     </div>
    </motion.div>)}</AnimatePresence>
  </div>
 </Context.Provider>
}
