import {useCallback,useEffect,useRef,useState} from 'react'
import {ArrowLeftRight,ArrowDown,ArrowUp,Check,Copy,FileUp,GitCompareArrows,PenLine,Play,RotateCcw} from 'lucide-react'
import {useVirtualizer} from '@tanstack/react-virtual'
import {Button} from '@/components/ui/button'
import {SelectField} from '@/components/ui/select-field'
import {SwitchField} from '@/components/ui/switch-field'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {DiffInputEditor} from '@/components/diff/DiffInputEditor'
import {DIFF_MAX_BYTES,type DiffMode,type DiffResult} from '@/lib/diff/compare'

const enc=new TextEncoder()
type Side='left'|'right'
export function TextDiffPage(){
 const [left,setLeft]=useState('')
 const [right,setRight]=useState('')
 const [mode,setMode]=useState<DiffMode>('text')
 const [ignoreKeyOrder,setIgnoreKeyOrder]=useState(true)
 const [result,setResult]=useState<DiffResult|null>(null)
 const [viewing,setViewing]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [selected,setSelected]=useState(0)
 const workerRef=useRef<Worker|null>(null)
 const inputLeft=useRef<HTMLInputElement>(null)
 const inputRight=useRef<HTMLInputElement>(null)
 const viewport=useRef<HTMLDivElement>(null)
 const virtualizer=useVirtualizer({count:viewing?(result?.rows.length??0):0,getScrollElement:()=>viewport.current,estimateSize:()=>32,overscan:14})
 const abort=useCallback(()=>{workerRef.current?.terminate();workerRef.current=null;setBusy(false)},[])
 useEffect(()=>()=>{workerRef.current?.terminate()},[])
 const invalidate=useCallback(()=>{abort();setResult(null);setViewing(false);setSelected(0);setError('')},[abort])
 const changeText=(side:Side,value:string)=>{
  if(enc.encode(value).length>DIFF_MAX_BYTES){setError('单侧文本最多 2 MiB，已保留原内容');return}
  invalidate()
  if(side==='left')setLeft(value);else setRight(value)
 }
 const changeMode=(value:string)=>{invalidate();setMode(value as DiffMode)}
 const toggleSort=(value:boolean)=>{invalidate();setIgnoreKeyOrder(value)}
 const importText=async(side:Side,file:File)=>{
  if(file.size>DIFF_MAX_BYTES){setError('文件超过 2 MiB 上限，未覆盖原内容');return}
  try{changeText(side,await file.text())}catch{setError('无法读取文件，请确认它是 UTF-8 文本')}
 }
 const run=()=>{
  abort();setError('')
  if(enc.encode(left).length>DIFF_MAX_BYTES||enc.encode(right).length>DIFF_MAX_BYTES){setError('单侧文本超过 2 MiB 上限');return}
  const worker=new Worker(new URL('../workers/diff.worker.ts',import.meta.url),{type:'module'})
  workerRef.current=worker
  setBusy(true)
  worker.onmessage=(event:MessageEvent<{id:number;ok:boolean;result?:DiffResult;error?:string}>)=>{
   if(workerRef.current!==worker)return
   worker.terminate();workerRef.current=null;setBusy(false)
   if(!event.data.ok||!event.data.result){setError(event.data.error||'比较失败');return}
   setResult(event.data.result);setSelected(0);setViewing(true)
  }
  worker.onerror=()=>{if(workerRef.current===worker){worker.terminate();workerRef.current=null;setBusy(false);setError('比较线程运行失败，请重试')}}
  worker.postMessage({id:1,left,right,mode,ignoreKeyOrder})
 }
 const jump=(position:number)=>{
  if(!result?.blocks.length)return
  const next=(position+result.blocks.length)%result.blocks.length
  setSelected(next);virtualizer.scrollToIndex(result.blocks[next].start,{align:'center'})
 }
 useEffect(()=>{
  if(viewing&&result?.blocks.length)virtualizer.scrollToIndex(result.blocks[0].start,{align:'center'})
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[viewing,result])
 const copy=async(value:string)=>{
  try{await navigator.clipboard.writeText(value);setError('')}
  catch{setError('复制到剪贴板失败')}
 }
 const sourcePanel=(side:Side)=>{
  const value=side==='left'?left:right
  const ref=side==='left'?inputLeft:inputRight
  return <section className="flex min-h-0 min-w-0 flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
   <div className="flex flex-wrap items-center gap-2">
    <h2 className="mr-auto text-sm font-semibold">{side==='left'?'左侧 · 原始版本':'右侧 · 新版本'}</h2>
    <span className="text-[11px] muted">{enc.encode(value).length.toLocaleString()} B</span>
    <input ref={ref} className="hidden" type="file" accept=".txt,.json,.log,.xml,.yaml,.yml,.csv,.md,.conf,.ini,text/*,application/json" aria-label={side==='left'?'导入左侧文件':'导入右侧文件'} onChange={e=>{const file=e.target.files?.[0];if(file)void importText(side,file);e.target.value=''}}/>
    <Button size="sm" variant="ghost" title="从文件导入" onClick={()=>ref.current?.click()}><FileUp size={14}/> 导入</Button>
    <Button size="icon" variant="ghost" title="复制内容" disabled={!value} onClick={()=>void copy(value)}><Copy size={14}/></Button>
    <Button size="icon" variant="ghost" title="清空内容" disabled={!value} onClick={()=>changeText(side,'')}><RotateCcw size={14}/></Button>
   </div>
   <div className="min-h-[260px] flex-1">
    <DiffInputEditor mode={mode} label={side==='left'?'左侧比较输入':'右侧比较输入'} value={value} onChange={text=>changeText(side,text)}/>
   </div>
  </section>
 }
 return <div className="flex h-full min-h-0 flex-col gap-4 p-5">
  <header className="flex flex-wrap items-center gap-3">
   <div className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><ToolPageIcon size={22}/></div>
   <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">文本 / JSON 差异对比</h1><p className="mt-1 text-xs muted">双栏比对 · 差异定位 · 纯本地处理，不保存输入内容</p></div>
   {viewing&&<Button onClick={()=>setViewing(false)}><PenLine size={15}/> 编辑内容</Button>}
  </header>
  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
   <SelectField ariaLabel="比较模式" className="min-w-[155px]" value={mode} onValueChange={changeMode} options={[{value:'text',label:'文本逐行对比'},{value:'json',label:'JSON 结构对比'}]}/>
   {mode==='json'&&<label className="flex items-center gap-2 text-xs"><SwitchField checked={ignoreKeyOrder} onCheckedChange={toggleSort} ariaLabel="忽略 JSON 对象键顺序"/>忽略键顺序</label>}
   {mode==='json'&&<span className="text-xs muted">JSON 会格式化后比较，数组顺序保持不变</span>}
   <Button size="sm" onClick={()=>{invalidate();setLeft(right);setRight(left)}}><ArrowLeftRight size={14}/> 交换两侧</Button>
   <div className="ml-auto flex gap-2">
    {busy&&<Button size="sm" onClick={abort}>取消</Button>}
    <Button variant="primary" disabled={busy} onClick={run}><Play size={15}/> {busy?'比较中…':'开始对比'}</Button>
   </div>
  </div>
  {error&&<div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-xs text-rose-500">{error}</div>}
  {!viewing||!result?
   <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-2">{sourcePanel('left')}{sourcePanel('right')}</div>
   :<>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2">
     <span className="flex items-center gap-2 text-xs font-semibold">
      {result.blocks.length===0?<Check size={16} className="text-emerald-500"/>:<GitCompareArrows size={16} className="text-indigo-400"/>}
      {result.blocks.length===0?'内容一致':'发现 '+result.blocks.length+' 处差异'}
     </span>
     <span className="text-xs text-emerald-600 dark:text-emerald-400">+{result.added} 行</span>
     <span className="text-xs text-rose-600 dark:text-rose-400">−{result.removed} 行</span>
     <span className="text-xs text-amber-600 dark:text-amber-400">修改 {result.modified} 行</span>
     {result.isNormalized&&<span className="text-xs muted">展示为规范化 JSON（输入不变）</span>}
     <div className="ml-auto flex items-center gap-1">
      <span aria-live="polite" className="mr-2 text-xs muted">{result.blocks.length?(selected+1)+' / '+result.blocks.length:'0 / 0'}</span>
      <Button size="icon" variant="ghost" title="上一处差异" aria-label="上一处差异" disabled={!result.blocks.length} onClick={()=>jump(selected-1)}><ArrowUp size={15}/></Button>
      <Button size="icon" variant="ghost" title="下一处差异" aria-label="下一处差异" disabled={!result.blocks.length} onClick={()=>jump(selected+1)}><ArrowDown size={15}/></Button>
     </div>
    </div>
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
     <div className="grid grid-cols-2 divide-x divide-[var(--border)] border-b border-[var(--border)] text-xs font-semibold">
      <div className="flex items-center justify-between px-4 py-3"><span>原始版本</span><Button size="icon" variant="ghost" title="复制左侧对比视图" onClick={()=>void copy(result.leftDisplay)}><Copy size={14}/></Button></div>
      <div className="flex items-center justify-between px-4 py-3"><span>新版本</span><Button size="icon" variant="ghost" title="复制右侧对比视图" onClick={()=>void copy(result.rightDisplay)}><Copy size={14}/></Button></div>
     </div>
     <div ref={viewport} className="min-h-0 flex-1 overflow-auto font-mono text-[12px]" aria-label="对齐后的差异列表" tabIndex={0}>
      <div style={{height:virtualizer.getTotalSize(),position:'relative',width:'100%'}}>
       {virtualizer.getVirtualItems().map(item=>{
        const row=result.rows[item.index]
        const leftChanged=row.kind==='removed'||row.kind==='modified'
        const rightChanged=row.kind==='added'||row.kind==='modified'
        const line=(which:Side)=>{
         const nr=which==='left'?row.leftNumber:row.rightNumber
         const lineText=which==='left'?row.leftText:row.rightText
         const changed=which==='left'?leftChanged:rightChanged
         const color=changed?(which==='left'?'bg-rose-500/10':'bg-emerald-500/10'):''
         return <div className={'flex h-8 min-w-0 items-center overflow-hidden border-b border-[var(--border)]/40 '+color} title={lineText}>
          <span className="w-[52px] shrink-0 select-none border-r border-[var(--border)]/40 px-2 text-right text-[10px] text-[var(--muted)]">{nr??' '}</span>
          <span className="w-5 shrink-0 select-none text-center font-bold">{changed?(which==='left'?'−':'+'):''}</span>
          <code className="block min-w-0 flex-1 truncate whitespace-pre pr-4 text-[var(--foreground)]">{lineText||' '}</code>
         </div>
        }
        return <div key={item.key} className="absolute left-0 grid w-full grid-cols-2 divide-x divide-[var(--border)]" style={{height:item.size,transform:'translateY('+item.start+'px)'}}>
         {line('left')}{line('right')}
        </div>
       })}
      </div>
     </div>
     <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] muted">左右行已对齐，红色为删除或原始内容，绿色为新增或更新；超长行可返回编辑页查看完整文本。</p>
    </section>
   </>
  }
 </div>
}
