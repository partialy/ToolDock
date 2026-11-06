import {useCallback,useEffect,useState} from 'react'
import {Copy,Search,ChevronLeft,ChevronRight} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {DialogShell} from '@/components/ui/dialog-shell'
import {msg} from '@/components/ui/message'
import type {ConversionTask,ConversionPreview} from '@/shared/textConversionModels'

const PAGE=8000
export function TextConversionPreviewDialog({task,onClose}:{task:ConversionTask|null;onClose:()=>void}){
 const [offset,setOffset]=useState(0),[source,setSource]=useState<ConversionPreview|null>(null),[result,setResult]=useState<ConversionPreview|null>(null),[query,setQuery]=useState(''),[loading,setLoading]=useState(false)
 const load=useCallback(async(id:string,at:number)=>{
  setLoading(true)
  try{
   const [s,r]=await Promise.all([window.toolDock.textConversion.preview(id,'source',at,PAGE),window.toolDock.textConversion.preview(id,'result',at,PAGE)])
   setSource(s);setResult(r)
  }catch(e){msg.error(e)}finally{setLoading(false)}
 },[])
 useEffect(()=>{if(task){setOffset(0);setQuery('');void load(task.id,0)}else{setSource(null);setResult(null)}},[task?.id,load])
 const go=(next:number)=>{if(!task)return;setOffset(next);void load(task.id,next)}
 const search=async()=>{
  if(!task||!query.trim())return
  try{
   const match=await window.toolDock.textConversion.search(task.id,'result',query,offset+1)
   if(match<0)msg.info('没有找到更多匹配内容')
   else go(match)
  }catch(e){msg.error(e)}
 }
 const copy=async(side:'source'|'result')=>{
  const data=side==='source'?source:result
  if(!data)return
  try{await navigator.clipboard.writeText(data.text);msg.success('已复制当前预览片段')}catch(e){msg.error(e)}
 }
 return <DialogShell open={!!task} onOpenChange={open=>{if(!open)onClose()}} title={task?'转换预览 · '+task.name:'转换预览'} description="左侧为原文，右侧为转换结果。大文件按片段预览，不会一次加载整份内容。" width="workspace"
  footer={<><span className="mr-auto text-xs muted">第 {offset+1} 字符起 · 每页最多 {PAGE} 字符</span><Button size="sm" disabled={offset===0||loading} onClick={()=>go(Math.max(0,offset-PAGE))}><ChevronLeft size={14}/>上一段</Button><Button size="sm" disabled={loading||!result||offset+PAGE>=result.total} onClick={()=>go(offset+PAGE)}>下一段<ChevronRight size={14}/></Button><Button onClick={onClose}>关闭</Button></>}>
  <div className="mb-3 flex flex-wrap items-center gap-2"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void search()}} placeholder="在转换结果中搜索" className="h-9 flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-xs outline-none focus:border-indigo-500"/><Button size="sm" onClick={()=>void search()} disabled={!query.trim()}><Search size={14}/>查找下一个</Button></div>
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
   {([{key:'source',label:'原文',data:source},{key:'result',label:'转换结果',data:result}] as const).map(part=><div key={part.key} className="min-w-0"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-medium">{part.label} · {part.data?.total??0} 字符</span><Button size="sm" disabled={!part.data?.text} onClick={()=>void copy(part.key)}><Copy size={13}/>复制当前片段</Button></div><pre className="max-h-[48vh] min-h-52 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 font-mono text-xs leading-6">{loading?'正在读取…':part.data?.text||'暂无内容'}</pre></div>)}
  </div>
 </DialogShell>
}
