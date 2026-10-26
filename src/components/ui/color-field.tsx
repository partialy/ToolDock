import {useState} from 'react'
import * as Popover from '@radix-ui/react-popover'
import {Palette} from 'lucide-react'
import {normalizeHex} from '@/lib/qr/config'
const swatches=['#111827','#ffffff','#123e73','#174c3a','#493289','#8a351e','#293748','#1766bd','#247451','#7258b2','#ad4b27','#f3f9ff','#f1faf3','#faf7ff','#fff7ee','#f8fafc']
export function ColorField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){
 const [draft,setDraft]=useState(value),[error,setError]=useState('')
 const commit=()=>{
  try{onChange(normalizeHex(draft));setError('')}catch(e){setError(e instanceof Error?e.message:String(e))}
 }
 return <div className="space-y-1">
  <label className="block text-[11px] muted">{label}</label>
  <Popover.Root onOpenChange={open=>{if(open){setDraft(value);setError('')}}}>
   <Popover.Trigger asChild><button aria-label={label} className="flex h-10 w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-2 hover:border-[var(--primary)]/50">
    <span className="h-6 w-6 shrink-0 rounded-md border border-[var(--border)]" style={{background:value.startsWith('#')&&value.length===7?value:'#fff'}}/>
    <span className="min-w-0 flex-1 truncate font-mono text-xs">{value}</span><Palette size={14} className="muted"/>
   </button></Popover.Trigger>
   <Popover.Portal><Popover.Content align="start" sideOffset={7} collisionPadding={12} className="z-[350] w-[255px] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-2xl">
    <div className="grid grid-cols-8 gap-1.5">{swatches.map(c=><button key={c} type="button" aria-label={'使用 '+c} className="h-6 w-6 rounded-md border border-[var(--border)] hover:ring-2 hover:ring-indigo-400" style={{background:c}} onClick={()=>{setDraft(c);onChange(c);setError('')}}/>)}</div>
    <label className="mt-3 block text-xs muted">HEX 六位颜色</label>
    <div className="mt-1 flex gap-2"><input aria-label={label+' HEX'} value={draft} maxLength={7} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')commit()}} className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-2 font-mono text-xs"/><button onClick={commit} className="rounded-lg bg-indigo-500 px-3 text-xs text-white">应用</button></div>
    {error&&<p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
   </Popover.Content></Popover.Portal>
  </Popover.Root>
 </div>
}
