import {useId,useMemo,useState} from 'react'
import * as Popover from '@radix-ui/react-popover'
import {AnimatePresence,motion} from 'motion/react'
import {CalendarDays,ChevronLeft,ChevronRight} from 'lucide-react'
import {Button} from './button'
import {PickerPopoverContent} from './picker-popover'
import {useMicroMotion} from './motion-preference'
const pad=(n:number)=>String(n).padStart(2,'0')
const todayString=(d:Date)=>String(d.getFullYear()).padStart(4,'0')+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())
export function DateField({value,onChange,ariaLabel='选择日期'}:{value:string;onChange:(v:string)=>void;ariaLabel?:string}){
 const [open,setOpen]=useState(false)
 const [month,setMonth]=useState(()=>{const d=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00'):new Date();return new Date(d.getFullYear(),d.getMonth(),1)})
 const [yearText,setYearText]=useState(String(month.getFullYear()))
 const [direction,setDirection]=useState(1)
 const {off,reduced}=useMicroMotion()
 const id=useId()
 const move=(y:number,m:number)=>{
  const n=new Date(y,m,1);if(n.getFullYear()<100||n.getFullYear()>9999)return
  setDirection(n.getTime()>=month.getTime()?1:-1)
  setMonth(n);setYearText(String(n.getFullYear()))
 }
 const lead=(month.getDay()+6)%7
 const count=new Date(month.getFullYear(),month.getMonth()+1,0).getDate()
 const cells=useMemo(()=>Array.from({length:Math.ceil((lead+count)/7)*7},(_,i)=>i-lead+1),[lead,count])
 const select=(day:number)=>{onChange(String(month.getFullYear()).padStart(4,'0')+'-'+pad(month.getMonth()+1)+'-'+pad(day));setOpen(false)}
 const today=()=>{const d=new Date();move(d.getFullYear(),d.getMonth());onChange(todayString(d));setOpen(false)}
 const onOpenChange=(next:boolean)=>{
  if(next&&/^\d{4}-\d{2}-\d{2}$/.test(value)){
   const [y,m]=value.split('-').map(Number);move(y,m-1)
  }
  setOpen(next)
 }
 const shift=off||reduced?0:18
 const fade=off?1:reduced?0.5:0.4
 return <Popover.Root open={open} onOpenChange={onOpenChange}>
  <Popover.Trigger asChild><button aria-label={ariaLabel} aria-expanded={open} className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-xs transition-colors duration-150 hover:border-[var(--primary)]/40 focus-visible:border-[var(--primary)] data-[state=open]:border-[var(--primary)]"><span>{value||'选择日期'}</span><CalendarDays size={15} className="muted"/></button></Popover.Trigger>
  <PickerPopoverContent open={open} className="w-[294px] overflow-hidden p-3">
   <div className="mb-2 flex items-center gap-2">
    <Button size="icon" variant="ghost" onClick={()=>move(month.getFullYear(),month.getMonth()-1)} title="上个月"><ChevronLeft size={16}/></Button>
    <input aria-label="年份" type="number" min={100} max={9999} value={yearText} onChange={e=>{setYearText(e.target.value);const n=Number(e.target.value);if(n>=100&&n<=9999)move(n,month.getMonth())}} className="w-[68px] rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] p-1 text-center text-xs"/>
    <span className="flex-1 text-center font-semibold">{month.getMonth()+1} 月</span>
    <Button size="icon" variant="ghost" onClick={()=>move(month.getFullYear(),month.getMonth()+1)} title="下个月"><ChevronRight size={16}/></Button>
   </div>
   <div className="grid grid-cols-7 gap-1 text-center text-xs muted">{['一','二','三','四','五','六','日'].map(s=><span key={s}>{s}</span>)}</div>
   <div className="relative mt-2 min-h-[216px] overflow-hidden">
    <AnimatePresence initial={false} custom={direction} mode="wait">
     <motion.div key={month.getFullYear()+'-'+month.getMonth()} custom={direction}
      initial={off?false:{opacity:fade,x:direction*shift}}
      animate={{opacity:1,x:0}}
      exit={off?{opacity:1}:{opacity:fade,x:-direction*shift}}
      transition={{duration:off?0:reduced?0.08:0.22,ease:[0.22,1,0.36,1]}}
      role="grid" aria-label="日期" className="grid grid-cols-7 gap-1">
      {cells.map((n,i)=>n>=1&&n<=count?
       <button type="button" key={i} aria-label={month.getFullYear()+'-'+pad(month.getMonth()+1)+'-'+pad(n)} aria-selected={value===month.getFullYear()+'-'+pad(month.getMonth()+1)+'-'+pad(n)} onClick={()=>select(n)}
        className={'h-8 rounded-lg text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] hover:bg-[var(--hover)] '+(value===month.getFullYear()+'-'+pad(month.getMonth()+1)+'-'+pad(n)?'bg-[var(--selected)] text-[var(--primary)]':'')}
        style={{transitionDuration:off?'0ms':reduced?'80ms':'150ms',transitionProperty:'background-color,color'}}>
        {n}
       </button>:<span key={i}/>)}
     </motion.div>
    </AnimatePresence>
   </div>
   <div className="mt-2 flex justify-between border-t border-[var(--border)] pt-2">
    <Button size="sm" variant="ghost" onClick={()=>{onChange('');setOpen(false)}}>清空</Button>
    <Button size="sm" variant="ghost" onClick={today}>今天</Button>
   </div>
   <span id={id} className="sr-only">通过上个月、下个月按钮切换月份，选择日期后自动关闭</span>
  </PickerPopoverContent>
 </Popover.Root>
}
