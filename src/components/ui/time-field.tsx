import {useEffect,useRef,useState} from 'react'
import * as Popover from '@radix-ui/react-popover'
import {Clock3} from 'lucide-react'
import {Button} from './button'
import {PickerPopoverContent} from './picker-popover'
import {useMicroMotion} from './motion-preference'
const pad=(n:number)=>String(n).padStart(2,'0')
export function TimeField({value,onChange,ariaLabel='选择时间'}:{value:string;onChange:(v:string)=>void;ariaLabel?:string}){
 const [open,setOpen]=useState(false)
 const {off,reduced}=useMicroMotion()
 const lists=useRef<(HTMLDivElement|null)[]>([])
 const values=value.split(':').map(Number)
 const [h,m,s]=values.length===3&&values.every(Number.isFinite)?values:[0,0,0]
 const choose=(ix:number,n:number)=>{const arr=[h,m,s];arr[ix]=n;onChange(arr.map(pad).join(':'))}
 const align=(ix:number,n:number)=>{
  const list=lists.current[ix];const option=list?.querySelector<HTMLElement>('[data-clock-value="'+n+'"]')
  if(!list||!option)return
  list.scrollTo({top:option.offsetTop-list.offsetTop-(list.clientHeight-option.offsetHeight)/2,behavior:off||reduced?'auto':'smooth'})
 }
 useEffect(()=>{
  if(!open)return
  const raf=requestAnimationFrame(()=>{[h,m,s].forEach((v,i)=>align(i,v))})
  return()=>cancelAnimationFrame(raf)
 },[open]) // Align once on open; user scrolling remains authoritative.
 const update=(ix:number,n:number)=>{choose(ix,n);align(ix,n)}
 return <Popover.Root open={open} onOpenChange={setOpen}>
  <Popover.Trigger asChild><button aria-label={ariaLabel} aria-expanded={open} className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-xs transition-colors duration-150 hover:border-[var(--primary)]/40 focus-visible:border-[var(--primary)] data-[state=open]:border-[var(--primary)]"><span>{value||'选择时间'}</span><Clock3 size={15} className="muted"/></button></Popover.Trigger>
  <PickerPopoverContent open={open} className="p-3">
   <div className="grid grid-cols-3 gap-2">{([['时',24,h],['分',60,m],['秒',60,s]] as const).map(([title,size,selected],ix)=><div key={title} className="w-[76px]">
    <label className="mb-1 block text-center text-[11px] muted">{title}</label>
    <input type="number" aria-label={title} min={0} max={size-1} value={selected} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=0&&n<size)update(ix,n)}} className="mb-2 h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] text-center text-xs"/>
    <div ref={el=>{lists.current[ix]=el}} role="listbox" aria-label={title} className="h-36 overflow-y-auto rounded-lg border border-[var(--border)] p-1">
     {Array.from({length:size},(_,n)=><button type="button" key={n} data-clock-value={n} role="option" aria-selected={n===selected} onClick={()=>update(ix,n)}
      onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=Math.max(0,Math.min(size-1,n+(e.key==='ArrowDown'?1:-1)));update(ix,next);lists.current[ix]?.querySelector<HTMLButtonElement>('[data-clock-value="'+next+'"]')?.focus()}}}
      className={'block w-full rounded-md py-1 text-center text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] '+(n===selected?'bg-[var(--selected)] text-[var(--primary)]':'hover:bg-[var(--hover)]')}
      style={{transitionDuration:off?'0ms':reduced?'80ms':'160ms',transitionProperty:'background-color,color'}}>{pad(n)}</button>)}
    </div></div>)}</div>
   <div className="mt-2 flex justify-end"><Button size="sm" onClick={()=>setOpen(false)}>确定</Button></div>
  </PickerPopoverContent>
 </Popover.Root>
}
