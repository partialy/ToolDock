import {msg} from '@/components/ui/message'
import {useCallback,useEffect,useRef,useState} from 'react'
import {Braces,Copy,Download,FileUp,RefreshCw,ArrowRightLeft,X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {SelectField} from '@/components/ui/select-field'
import {JsonEditor} from '@/components/json/JsonEditor'
import {JsonDiagnostics} from '@/components/json/JsonDiagnostics'
import {JsonTreeView} from '@/components/json/JsonTreeView'
import {useJsonWorker,type JsonReport} from '@/hooks/useJsonWorker'
import type {JsonAction,JsonIndent} from '@/lib/json/transform'
const MAX_BYTES=20*1024*1024
const encoder=new TextEncoder()
function download(text:string,name:string){
 const blob=new Blob([text],{type:'text/plain;charset=utf-8'})
 const url=URL.createObjectURL(blob)
 const a=document.createElement('a');a.href=url;a.download=name;a.click()
 setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export function JsonToolPage(){
 const worker=useJsonWorker()
 const [source,setSource]=useState('')
 const [revision,setRevision]=useState(0)
 const [report,setReport]=useState<JsonReport|null>(null)
 const [reportRevision,setReportRevision]=useState(-1)
 const [result,setResult]=useState('')
 const [resultRevision,setResultRevision]=useState(-1)
 const [resultAction,setResultAction]=useState<JsonAction>('format')
 const [indent,setIndent]=useState<JsonIndent>('2')
 const [panel,setPanel]=useState<'result'|'tree'>('result')
 const [busy,setBusy]=useState(false)
 const [status,setStatus]=useState('请输入 JSON')
 const [error,setError]=useState('')
 const fileRef=useRef<HTMLInputElement>(null)
 const edit=useCallback((value:string)=>{
  if(encoder.encode(value).length>MAX_BYTES){setError('文本超过 20 MiB，已拒绝加载');return}
  setSource(value);setRevision(x=>x+1);setError('')
 },[])
 useEffect(()=>{
  let active=true
  setReport(null);setStatus(source?'校验中…':'请输入 JSON')
  const timer=setTimeout(()=>{
   worker.parse(source,revision).then(r=>{if(!active)return;setReport(r);setReportRevision(revision);setStatus(r.valid?'JSON 语法有效':'请检查 JSON 语法')})
    .catch(e=>{if(active){setStatus('校验失败');setError(String(e))}})
  },source.length>1024*1024?550:220)
  return()=>{active=false;clearTimeout(timer)}
 },[revision,source,worker])
 const freshReport=reportRevision===revision?report:null
 const staleResult=resultRevision!==revision&&resultRevision>=0
 const process=async(action:JsonAction)=>{
  if(action!=='escape'&&action!=='unescape'&&!freshReport?.valid){setError('JSON 语法无效，无法处理');return}
  if(action!=='escape'&&action!=='unescape'&&freshReport?.duplicates.length){setError('存在重复 Key，为避免误改数据已阻止此操作');return}
  setBusy(true);setError('')
  try{
   const value=await worker.transform(action,source,revision,indent)
   setResult(value);setResultRevision(revision);setResultAction(action);setPanel('result');setStatus('转换完成')
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);msg.success('已复制')}catch{msg.error('复制失败')}}
 const importFile=async(file:File)=>{
  if(file.size>MAX_BYTES){setError('文件超过 20 MiB，已拒绝导入');return}
  if(!/\.(json|txt)$/i.test(file.name)){setError('只支持 .json 或 .txt 文件');return}
  try{edit(await file.text())}catch{setError('文件读取失败')}
 }
 const canReplace=resultRevision===revision&&!busy
 const validTree=freshReport?.valid?freshReport.root:null
 const getChildren=useCallback((id:string,start=0)=>worker.children(id,revision,start),[worker,revision])
 const search=useCallback((q:string)=>worker.search(q,revision),[worker,revision])
 const getNode=useCallback((id:string,mode:'raw'|'display'='raw')=>worker.node(id,revision,mode),[worker,revision])
 return <div className="mx-auto max-w-[1460px] space-y-4 p-6">
  <header className="flex flex-wrap items-center gap-3">
   <div className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><ToolPageIcon size={22}/></div>
   <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">JSON 处理工具</h1><p className="mt-1 text-xs muted">无损格式化、压缩、排序、转义及树形查看；所有数据仅在本地处理</p></div>
   <input aria-label="导入 JSON 文件" className="hidden" ref={fileRef} type="file" accept=".json,.txt,application/json,text/plain" onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value=''}}/>
   <Button onClick={()=>fileRef.current?.click()}><FileUp size={15}/> 导入</Button>
   <Button onClick={()=>download(source,'source.json')} disabled={!source}><Download size={15}/> 导出原文</Button>
  </header>
  <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
   {([['format','格式化'],['compact','压缩'],['sort','Key 排序'],['escape','转义'],['unescape','反转义']] as const).map(([action,label])=>
    <Button key={action} size="sm" disabled={busy||!source||(action!=='escape'&&action!=='unescape'&&(!freshReport?.valid||!!freshReport.duplicates.length))} onClick={()=>void process(action)}>{label}</Button>)}
   <SelectField ariaLabel="JSON 缩进" value={indent} onValueChange={v=>setIndent(v as JsonIndent)} options={[{value:'2',label:'2 空格'},{value:'4',label:'4 空格'},{value:'tab',label:'Tab 缩进'}]} className="ml-auto min-w-[125px]"/>
   <Button size="sm" variant="ghost" disabled={!busy} onClick={()=>{worker.cancel();setBusy(false);setReport(null);setRevision(x=>x+1);setStatus('操作已取消')}}><X size={14}/>取消</Button>
  </section>
  <div className="grid gap-4 xl:grid-cols-2">
   <section className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
    <div className="flex h-8 items-center justify-between"><h2 className="text-sm font-medium">原始 JSON</h2><span className="text-xs muted">{encoder.encode(source).length.toLocaleString()} bytes</span></div>
    <JsonEditor ariaLabel="JSON 源码编辑器" value={source} onChange={edit} diagnostics={freshReport?[...freshReport.diagnostics,...freshReport.duplicates]:[]} className="h-[420px]"/>
    <JsonDiagnostics text={source} errors={freshReport?.diagnostics||[]} duplicates={freshReport?.duplicates||[]}/>
    <div className="flex items-center justify-between"><span className="text-xs muted">{status}</span><Button variant="ghost" size="sm" onClick={()=>edit('')}><RefreshCw size={14}/> 清空</Button></div>
   </section>
   <section className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
    <div className="flex h-8 flex-wrap items-center justify-between gap-2">
     <div className="flex items-center gap-1 rounded-lg bg-[var(--panel-alt)] p-0.5">
      {(['result','tree'] as const).map(k=><button key={k} onClick={()=>setPanel(k)} className={'rounded-md px-3 py-1 text-xs '+(panel===k?'bg-[var(--panel)] font-semibold shadow':'muted')}>{k==='result'?'处理结果':'树形视图'}</button>)}
     </div>
     {panel==='result'&&<div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" disabled={!canReplace} onClick={()=>edit(result)}><ArrowRightLeft size={14}/> 替换原文</Button>
      <Button size="icon" variant="ghost" disabled={!canReplace} title="复制结果" onClick={()=>void copy(result)}><Copy size={15}/></Button>
      <Button size="icon" variant="ghost" disabled={!canReplace} title="下载结果" onClick={()=>download(result,resultAction==='escape'||resultAction==='unescape'?'result.txt':'result.json')}><Download size={15}/></Button>
     </div>}
    </div>
    {panel==='result'?<div className="relative">
     <JsonEditor ariaLabel="JSON 处理结果" value={result} readOnly className="h-[420px]"/>
     {staleResult&&<div role="status" className="absolute left-4 top-3 rounded-lg border border-amber-500/40 bg-[var(--panel)] px-3 py-1.5 text-xs text-amber-400">结果已过期，请重新处理</div>}
    </div>:<JsonTreeView root={validTree||null} revision={revision} getChildren={getChildren} search={search} getNode={getNode}/>}
    <p className="text-xs muted">树形查看使用按需加载；无效 JSON 不会显示历史树形。</p>
   </section>
  </div>
  {error&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">{error}</div>}
 </div>
}
