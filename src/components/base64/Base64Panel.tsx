import {useMemo,useState} from 'react'
import {ArrowLeftRight,Copy,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {SelectField} from '@/components/ui/select-field'
import {SwitchField} from '@/components/ui/switch-field'
import {encodeBase64,decodeBase64,type Base64Variant} from '@/lib/base64'

export function Base64Panel(){
 const [input,setInput]=useState('')
 const [direction,setDirection]=useState<'encode'|'decode'>('encode')
 const [variant,setVariant]=useState<Base64Variant>('standard')
 const [padded,setPadded]=useState(true)
 const [error,setError]=useState('')
 const converted=useMemo(()=>{
  if(!input)return {value:'',error:''}
  try{return {value:direction==='encode'?encodeBase64(input,variant==='auto'?'standard':variant,padded):decodeBase64(input,variant),error:''}}
  catch(e){return {value:'',error:e instanceof Error?e.message:String(e)}}
 },[input,direction,variant,padded])
 const copy=async()=>{try{await navigator.clipboard.writeText(converted.value);setError('')}catch{setError('复制失败')}}
 const swap=()=>{if(converted.error)return;setInput(converted.value);setDirection(direction==='encode'?'decode':'encode')}
 return <div className="space-y-5">
  <div className="flex flex-wrap items-center gap-3">
   <div className="flex h-10 items-center rounded-xl bg-[var(--panel-alt)] p-1">
    {(['encode','decode'] as const).map(v=><button key={v} onClick={()=>setDirection(v)} className={'h-8 rounded-lg px-4 text-xs transition-colors '+(v===direction?'bg-[var(--panel)] shadow':'muted')}>{v==='encode'?'编码':'解码'}</button>)}
   </div>
   <SelectField ariaLabel="Base64 编码模式" value={variant} onValueChange={v=>{setVariant(v as Base64Variant);setPadded(v!=='url')}} options={[{value:'standard',label:'标准 Base64'},{value:'url',label:'URL Safe'},{value:'auto',label:'自动识别（解码）'}]} className="min-w-[176px]"/>
   {direction==='encode'&&<div className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs"><span>保留 = 填充</span><SwitchField ariaLabel="保留等号填充" checked={padded} onCheckedChange={setPadded}/></div>}
  </div>
  <div className="grid gap-4 md:grid-cols-2">
   <section className="space-y-2">
    <div className="flex items-center justify-between"><span className="text-xs font-medium muted">输入内容 · UTF-8</span><Button size="icon" variant="ghost" title="清空" onClick={()=>{setInput('');setError('')}}><Trash2 size={15}/></Button></div>
    <textarea aria-label="Base64 输入" spellCheck={false} value={input} onChange={e=>setInput(e.target.value)} placeholder={direction==='encode'?'输入待编码文本…':'粘贴 Base64 或 Base64URL…'} className="h-60 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 font-mono text-xs outline-none focus:border-[var(--primary)]"/>
   </section>
   <section className="space-y-2">
    <div className="flex items-center justify-between"><span className="text-xs font-medium muted">实时输出</span><div className="flex items-center gap-1"><Button variant="ghost" size="icon" title="交换输入输出" disabled={!!converted.error} onClick={swap}><ArrowLeftRight size={15}/></Button><Button variant="ghost" size="icon" title="复制输出" disabled={!!converted.error||!converted.value} onClick={()=>void copy()}><Copy size={15}/></Button></div></div>
    <textarea aria-label="Base64 输出" readOnly value={converted.value} className="h-60 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 font-mono text-xs outline-none focus:border-[var(--primary)]"/>
   </section>
  </div>
  {(converted.error||error)&&<p role="alert" className="text-xs text-red-400">{converted.error||error}</p>}
  <p className="text-xs muted">仅本地处理，不保存输入。解码严格验证 Base64 格式及 UTF-8，支持规范无填充编码。</p>
 </div>
}
