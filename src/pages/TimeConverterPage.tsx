import {msg} from '@/components/ui/message'
import {useEffect,useState} from 'react'
import {Clock3,Copy,Pause,Play} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {SelectField} from '@/components/ui/select-field'
import {DateTimeField} from '@/components/ui/date-time-field'
import {dateToTimestamps,formatLocal,parseLocalDateTime,timestampToDate,type TimestampUnit} from '@/lib/time/timestamp'
const initial=()=>formatLocal(new Date())
export function TimeConverterPage(){
 const [now,setNow]=useState(()=>Date.now()),[paused,setPaused]=useState(false)
 const [timestamp,setTimestamp]=useState(''),[unit,setUnit]=useState<TimestampUnit>('auto')
 const [stampResult,setStampResult]=useState<Date|null>(null),[localInput,setLocalInput]=useState(initial)
 const [dateResult,setDateResult]=useState<{second:string;millisecond:string}|null>(null),[error,setError]=useState('')
 useEffect(()=>{if(paused)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[paused])
 const copy=(text:string)=>void navigator.clipboard.writeText(text).then(()=>{msg.success('已复制')},()=>{msg.error('复制失败')})
 const fromStamp=()=>{try{setStampResult(timestampToDate(timestamp,unit));setError('')}catch(e){setError(String(e));setStampResult(null)}}
 const fromDate=()=>{try{setDateResult(dateToTimestamps(parseLocalDateTime(localInput)));setError('')}catch(e){setError(String(e));setDateResult(null)}}
 const output=(label:string,text:string)=> <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] p-3"><div className="min-w-0 flex-1"><div className="mb-1 text-xs muted">{label}</div><div className="break-all font-mono text-xs">{text}</div></div><Button size="icon" variant="ghost" title={'复制'+label} onClick={()=>copy(text)}><Copy size={15}/></Button></div>
 const clock=new Date(now)
 return <div className="@container mx-auto max-w-[1180px] space-y-5 p-6">
  <div className="flex items-center gap-3"><ToolPageIcon size={25} className="text-indigo-400"/><div><h1 className="text-xl font-semibold">时间转换</h1><p className="text-xs muted">Unix 秒/毫秒时间戳 · 本地时间 · UTC · ISO 8601</p></div></div>
  <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
   <div className="flex-1"><div className="text-xs muted">当前 Unix 时间戳 · 秒</div><div className="mt-2 font-mono text-2xl font-semibold">{Math.floor(now/1000)}</div><div className="mt-1 text-xs muted">{formatLocal(clock)}</div></div>
   <div className="flex-1"><div className="text-xs muted">毫秒</div><div className="mt-2 font-mono text-lg">{now}</div></div>
   <div className="flex gap-2"><Button onClick={()=>setPaused(x=>!x)}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?'继续':'暂停'}</Button><Button onClick={()=>copy(String(Math.floor(now/1000)))}>复制秒</Button><Button onClick={()=>copy(String(now))}>复制毫秒</Button></div>
  </section>
  <div className="grid gap-4 @min-[900px]:grid-cols-2">
   <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="font-semibold">时间戳 → 日期时间</h2>
    <input value={timestamp} aria-label="时间戳" placeholder="例如 1700000000" onChange={e=>setTimestamp(e.target.value)} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 font-mono"/>
    <SelectField ariaLabel="时间戳单位" value={unit} onValueChange={v=>setUnit(v as TimestampUnit)} options={[{value:'auto',label:'自动识别（10 / 13 位）'},{value:'second',label:'秒'},{value:'millisecond',label:'毫秒'}]}/>
    <Button variant="primary" onClick={fromStamp}>转换</Button>
    {stampResult&&<div className="space-y-2">{output('本地时间',formatLocal(stampResult))}{output('UTC',stampResult.toUTCString())}{output('ISO 8601',stampResult.toISOString())}</div>}
   </section>
   <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="font-semibold">日期时间 → 时间戳</h2>
    <DateTimeField value={localInput} onChange={v=>{setLocalInput(v);setDateResult(null)}}/>
    <div className="flex gap-2"><Button variant="primary" onClick={fromDate}>转换</Button><Button onClick={()=>{setLocalInput(initial());setDateResult(null)}}>设为现在</Button></div>
    {dateResult&&<div className="space-y-2">{output('秒级时间戳',dateResult.second)}{output('毫秒时间戳',dateResult.millisecond)}</div>}
   </section>
  </div>
  {error&&<p role="alert" className="rounded-xl border border-red-500/30 p-3 text-xs text-red-400">{error}</p>}
 </div>
}
