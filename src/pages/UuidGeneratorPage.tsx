import {useState} from 'react'
import {Copy,Download,Fingerprint,RefreshCw} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {SwitchField} from '@/components/ui/switch-field'
import {generateUuids} from '@/lib/uuid'
export function UuidGeneratorPage(){
 const [count,setCount]=useState(5),[upper,setUpper]=useState(false),[compact,setCompact]=useState(false)
 const [results,setResults]=useState<string[]>([]),[error,setError]=useState('')
 const generate=()=>{try{setResults(generateUuids(count,upper,compact));setError('')}catch(e){setError(String(e))}}
 const copy=(v:string)=>void navigator.clipboard.writeText(v).catch(()=>setError('复制失败'))
 const download=()=>{if(!results.length)return;const url=URL.createObjectURL(new Blob([results.join('\n')],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='uuid.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <div className="mx-auto max-w-5xl space-y-5 p-6">
  <div className="flex items-center gap-3"><Fingerprint size={25} className="text-indigo-400"/><div><h1 className="text-xl font-semibold">UUID / GUID 生成</h1><p className="text-xs muted">密码学安全随机 UUID v4 · 本地生成</p></div></div>
  <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
   <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2">生成数量<input aria-label="生成数量" type="number" min={1} max={1000} value={count} onChange={e=>setCount(Number(e.target.value))} className="h-10 w-28 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3"/></label>{[1,5,10,20,50,100].map(n=><Button size="sm" key={n} variant={count===n?'primary':'ghost'} onClick={()=>setCount(n)}>{n}</Button>)}</div>
   <div className="flex flex-wrap gap-6"><label className="flex items-center gap-3">大写字母<SwitchField ariaLabel="大写字母" checked={upper} onCheckedChange={setUpper}/></label><label className="flex items-center gap-3">去除连字符<SwitchField ariaLabel="去除连字符" checked={compact} onCheckedChange={setCompact}/></label></div>
   <div className="flex flex-wrap gap-2"><Button variant="primary" onClick={generate}><RefreshCw size={15}/> 生成 UUID</Button><Button disabled={!results.length} onClick={()=>copy(results.join('\n'))}><Copy size={15}/> 复制全部</Button><Button disabled={!results.length} onClick={download}><Download size={15}/> 下载 TXT</Button></div>
   <div aria-label="UUID 结果列表" className="max-h-[440px] space-y-1 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3">{results.length?results.map((v,i)=><div key={i} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--hover)]"><span className="flex-1 break-all font-mono text-xs">{v}</span><Button variant="ghost" size="icon" title="复制" onClick={()=>copy(v)}><Copy size={14}/></Button></div>):<p className="py-10 text-center text-xs muted">点击生成 UUID 查看结果</p>}</div>
  </section>{error&&<p role="alert" className="text-red-400">{error}</p>}
 </div>
}
