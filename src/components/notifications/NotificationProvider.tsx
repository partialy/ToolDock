import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {AnimatePresence,motion} from 'motion/react'
import {Bell,X,AlertTriangle,CheckCircle2,Info} from 'lucide-react'
import type {NotificationPosition} from '@/shared/fileTransferModels'
import {useMicroMotion} from '@/components/ui/motion-preference'
type Level='info'|'success'|'warning'|'error'
type Item={id:number;title:string;description:string;level:Level;action?:()=>void;sticky:boolean;dedupeKey?:string}
type Push=(data:{title:string;description:string;level?:Level;action?:()=>void;sticky?:boolean;dedupeKey?:string})=>void
const Context=createContext<Push>(()=>{})
export const useNotification=()=>useContext(Context)
export function NotificationProvider({children,position,onOpenTransfer}:{children:ReactNode;position:NotificationPosition;onOpenTransfer:()=>void}){
 const [items,setItems]=useState<Item[]>([])
 const counter=useRef(0),timers=useRef<Map<number,ReturnType<typeof setTimeout>>>(new Map())
 const {off,reduced}=useMicroMotion()
 const dismiss=useCallback((id:number)=>{setItems(a=>a.filter(t=>t.id!==id));const timer=timers.current.get(id);if(timer)clearTimeout(timer);timers.current.delete(id)},[])
 const push=useCallback<Push>(item=>{
  const id=++counter.current
  setItems(prev=>{
   const old=item.dedupeKey?prev.find(v=>v.dedupeKey===item.dedupeKey):null
   if(old){const timer=timers.current.get(old.id);if(timer)clearTimeout(timer);timers.current.delete(old.id)}
   return [...prev.filter(v=>v.id!==old?.id).slice(-2),{id,...item,level:item.level||'info',sticky:Boolean(item.sticky)}]
  })
  if(!item.sticky&&item.level!=='error')timers.current.set(id,setTimeout(()=>dismiss(id),6000))
 },[dismiss])
 useEffect(()=>{
  const offPending=window.toolDock.transfer.onPending((data)=>push({title:'文件等待接收',description:'来自局域网的文件「'+data.name+'」已经上传完成，需要电脑确认接收。',level:'warning',action:onOpenTransfer,dedupeKey:'transfer-pending',sticky:true}))
  const demo=(event:Event)=>push((event as CustomEvent<Parameters<Push>[0]>).detail)
  window.addEventListener('tooldock:toast',demo)
  return()=>{offPending();window.removeEventListener('tooldock:toast',demo)}
 },[push,onOpenTransfer])
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
    className="pointer-events-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-xl">
     <div className="flex gap-2.5">
      <span className="mt-0.5 text-indigo-400">{item.level==='error'||item.level==='warning'?<AlertTriangle size={19}/>:item.level==='success'?<CheckCircle2 size={19}/>:item.level==='info'?<Info size={19}/>:<Bell size={19}/>}</span>
      <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{item.title}</div><p className="mt-1 break-words text-xs leading-5 muted">{item.description}</p>
       {item.action&&<button className="mt-2 text-xs font-medium text-indigo-400 hover:underline" onClick={()=>{item.action?.();dismiss(item.id)}}>查看待接收文件</button>}
      </div>
      <button aria-label="关闭通知" className="self-start rounded-lg p-1 hover:bg-[var(--hover)]" onClick={()=>dismiss(item.id)}><X size={15}/></button>
     </div>
    </motion.div>)}</AnimatePresence>
  </div>
 </Context.Provider>
}
