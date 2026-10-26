import {useEffect,useState} from 'react'
import {DateField} from './date-field'
import {TimeField} from './time-field'
import {Button} from './button'
export function DateTimeField({value,onChange}:{value:string;onChange:(v:string)=>void}){
 const [draft,setDraft]=useState(value)
 const [error,setError]=useState('')
 useEffect(()=>setDraft(value),[value])
 const parts=draft.split(' '),date=parts[0]||'',time=parts[1]||'00:00:00'
 const commit=()=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}:\d{2}$/.test(time)){setError('请选择有效日期和时间');return}onChange(date+' '+time);setError('')}
 return <div className="space-y-2">
  <div className="grid gap-2 sm:grid-cols-2"><DateField value={date} onChange={v=>setDraft(v+' '+time)}/><TimeField value={time} onChange={v=>setDraft(date+' '+v)}/></div>
  <div className="flex items-center gap-2"><input aria-label="直接输入日期与时间" value={draft} onChange={e=>setDraft(e.target.value)} className="h-9 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 font-mono text-xs" placeholder="YYYY-MM-DD HH:mm:ss"/><Button size="sm" onClick={commit}>确定</Button></div>
  {error&&<p role="alert" className="text-xs text-red-400">{error}</p>}
 </div>
}
