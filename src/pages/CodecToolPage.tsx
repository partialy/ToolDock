import {msg} from '@/components/ui/message'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {ArrowLeftRight,Copy,Download,FileUp,FolderOpen,Plus,Play,RotateCcw,Save,Trash2,X} from 'lucide-react'
import {DndContext,closestCenter,type DragEndEvent} from '@dnd-kit/core'
import {SortableContext,verticalListSortingStrategy,arrayMove} from '@dnd-kit/sortable'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {SelectField} from '@/components/ui/select-field'
import {SwitchField} from '@/components/ui/switch-field'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {useDialog} from '@/components/ui/dialog-provider'
import {CodecTextEditor} from '@/components/codec/CodecTextEditor'
import {CodecStepOptions} from '@/components/codec/CodecStepOptions'
import {CodecStepCard} from '@/components/codec/CodecStepCard'
import {useCodecWorker} from '@/hooks/useCodecWorker'
import {codecTemplates,instantiateTemplate} from '@/lib/codec/templates'
import {MAX_INPUT_BYTES,MAX_STEPS,makeStep,pipelineExportSchema,pipelineInputSchema,type CodecStep,type PipelineInput,type PipelineSaved,type PipelineSummary} from '@/shared/codecModels'
import type {RunResult} from '@/lib/codec/execute'

const enc=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true})
const blank=():PipelineInput=>({name:'',description:'',steps:[]})
const stamp=(x:PipelineInput)=>JSON.stringify(x)
function saveText(name:string,text:string,mime='text/plain;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([text],{type:mime}))
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)
}
export function CodecToolPage(){
 const dialog=useDialog()
 const {run,cancel}=useCodecWorker()
 const [mode,setMode]=useState<'quick'|'pipeline'>('quick')
 const [quick,setQuick]=useState<CodecStep>(()=>makeStep())
 const [draft,setDraft]=useState<PipelineInput>(blank)
 const [baseline,setBaseline]=useState(()=>stamp(blank()))
 const [current,setCurrent]=useState<PipelineSaved|null>(null)
 const [list,setList]=useState<PipelineSummary[]>([])
 const [search,setSearch]=useState('')
 const [libraryOpen,setLibraryOpen]=useState(false)
 const [selected,setSelected]=useState<string|null>(null)
 const [input,setInput]=useState('')
 const [result,setResult]=useState<RunResult|null>(null)
 const [preview,setPreview]=useState<{id:string;value:string;stage?:RunResult['stages'][number]}|null>(null)
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const [manual,setManual]=useState(false)
 const [exported,setExported]=useState(false)
 const seq=useRef(0),inputRef=useRef<HTMLInputElement>(null),configRef=useRef<HTMLInputElement>(null)
 const steps=useMemo(()=>mode==='quick'?[quick]:draft.steps,[mode,quick,draft.steps])
 const dirty=stamp(draft)!==baseline
 const inputBytes=useMemo(()=>enc.encode(input).length,[input])
 const large=inputBytes>1024*1024
 const unsaved=dirty||input.length>0||(result?.finalValue!==null&&result!==null&&!exported)
 useEffect(()=>{window.dispatchEvent(new CustomEvent('tooldock:unsaved',{detail:unsaved}));return()=>{window.dispatchEvent(new CustomEvent('tooldock:unsaved',{detail:false}))}},[unsaved])
 const refresh=useCallback(()=>window.toolDock.codecPipelines.list().then(setList).catch(e=>setError(String(e))),[])
 useEffect(()=>{void refresh()},[refresh])
 const invalidate=useCallback(()=>{seq.current++;cancel();setResult(null);setPreview(null);setSelected(null);setError('');setBusy(false);setExported(false)},[cancel])
 const editInput=(value:string)=>{
  if(enc.encode(value).length>MAX_INPUT_BYTES){setError('原始输入超过 2 MiB，已拒绝修改');return}
  invalidate();setInput(value)
 }
 const editQuick=(s:CodecStep)=>{invalidate();setQuick(s)}
 const editDraft=(x:PipelineInput)=>{invalidate();setDraft(x)}
 const setSteps=(next:CodecStep[])=>editDraft({...draft,steps:next})
 const runNow=useCallback(async()=>{
  const token=++seq.current
  setBusy(true);setError('')
  try{
   const r=await run(input,steps)
   if(seq.current===token){setResult(r);setPreview(null);setSelected(null);if(r.error)setError('第 '+(r.error.index+1)+' 步：'+r.error.message)}
  }catch(e){if(seq.current===token)setError(e instanceof Error?e.message:'转换失败')}
  finally{if(seq.current===token)setBusy(false)}
 },[run,input,steps])
 const previewNow=useCallback(async(id:string)=>{
  const token=++seq.current
  setSelected(id);setPreview(null);setBusy(true);setError('')
  try{
   const r=await run(input,steps,id)
   if(seq.current===token){
    if(r.selectedValue!==undefined)setPreview({id,value:r.selectedValue,stage:r.stages.find(s=>s.id===id)})
    else setError(r.error?.message||'无法预览该步骤')
   }
  }catch(e){if(seq.current===token)setError(e instanceof Error?e.message:'单步预览失败')}
  finally{if(seq.current===token)setBusy(false)}
 },[run,input,steps])
 useEffect(()=>{
  if(manual||large)return
  const timer=setTimeout(()=>{void runNow()},inputBytes>65536?500:230)
  return()=>clearTimeout(timer)
 // selected is deliberately not a dependency: stage previews run explicitly.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[input,quick,draft,mode,manual,large,runNow])
 const stepUpdate=(s:CodecStep)=>setSteps(draft.steps.map(x=>x.id===s.id?s:x))
 const changeMode=(next:'quick'|'pipeline')=>{
  invalidate()
  if(next==='pipeline'&&draft.steps.length===0)setDraft({...draft,steps:[{...quick}]})
  setMode(next);setSelected(null)
 }
 const selectTemplate=async(index:number)=>{
  if(dirty&&!(await dialog.confirm({title:'替换当前流程？',description:'当前流水线配置尚未保存，载入模板将替换步骤。',variant:'warning'})))return
  invalidate();setCurrent(null);setBaseline(stamp(blank()));setDraft({name:codecTemplates[index].name,description:codecTemplates[index].description,steps:instantiateTemplate(index)})
  setMode('pipeline');setSelected(null)
 }
 const load=async(id:string)=>{
  if((dirty||input.length>0)&&!(await dialog.confirm({title:'加载其他流程？',description:'将清除当前输入并替换未保存的流程配置，请确认。',variant:'warning'})))return
  try{
   const item=await window.toolDock.codecPipelines.get(id)
   invalidate();setCurrent(item);const x={name:item.name,description:item.description,steps:item.steps}
   setDraft(x);setBaseline(stamp(x));setSelected(null);setInput('');setMode('pipeline');setLibraryOpen(false)
  }catch(e){msg.error(e)}
 }
 const save=async(asNew=false)=>{
  try{
   const valid=pipelineInputSchema.parse(draft)
   const item=!asNew&&current?await window.toolDock.codecPipelines.update(current.id,current.revision,valid):await window.toolDock.codecPipelines.create(valid)
   setCurrent(item);setDraft({name:item.name,description:item.description,steps:item.steps});setBaseline(stamp({name:item.name,description:item.description,steps:item.steps}))
   await refresh();msg.success('流程已保存')
  }catch(e){msg.error(e)}
 }
 const duplicate=async(item:PipelineSummary)=>{
  try{await window.toolDock.codecPipelines.duplicate(item.id);await refresh();msg.success('流程已复制')}catch(e){msg.error(e)}
 }
 const remove=async(item:PipelineSummary)=>{
  if(!(await dialog.confirm({title:'删除保存的流程？',description:'将永久删除「'+item.name+'」，此操作不可撤销。',variant:'danger'})))return
  if(current?.id===item.id&&dirty&&!(await dialog.confirm({title:'放弃未保存修改？',description:'当前流程有未保存修改，删除后无法恢复。',variant:'warning'})))return
  try{await window.toolDock.codecPipelines.remove(item.id,item.revision);if(current?.id===item.id){setCurrent(null);setBaseline(stamp(blank()))}await refresh()}catch(e){msg.error(e)}
 }
 const exportConfig=()=>{
  try{const config=pipelineInputSchema.parse(draft)
   saveText('tooldock-codec-pipeline.json',JSON.stringify({format:'tooldock.codec-pipeline',version:1,pipeline:config},null,2),'application/json;charset=utf-8');msg.success('配置已导出')
  }catch(e){msg.error(e)}
 }
 const importConfig=async(file:File)=>{
  if(file.size>65536){setError('流程配置超过 64 KiB');return}
  if(dirty&&!(await dialog.confirm({title:'导入流程？',description:'导入会替换当前未保存的流程配置。',variant:'warning'})))return
  try{
   const raw=decoder.decode(await file.arrayBuffer())
   const data=pipelineExportSchema.parse(JSON.parse(raw))
   invalidate();setCurrent(null);setBaseline(stamp(blank()))
   setDraft({...data.pipeline,steps:data.pipeline.steps.map(s=>({...s,id:crypto.randomUUID()}))});setMode('pipeline');setSelected(null)
   const yes=await dialog.confirm({title:'导入成功',description:'是否将这个流程保存到 SQLite「我的流程」？取消则仅在当前工作区使用。',confirmText:'保存到我的流程',cancelText:'仅临时使用'})
   if(yes){const x={...data.pipeline,steps:data.pipeline.steps.map(s=>({...s,id:crypto.randomUUID()}))};const item=await window.toolDock.codecPipelines.create(x);setCurrent(item);setDraft(x);setBaseline(stamp(x));await refresh()}
  }catch(e){msg.error(e)}
 }
 const importText=async(file:File)=>{
  if(file.size>MAX_INPUT_BYTES){setError('文件超过 2 MiB');return}
  try{const data=new Uint8Array(await file.arrayBuffer()),value=decoder.decode(data)
   editInput(value.charCodeAt(0)===0xFEFF?value.slice(1):value)
  }catch{setError('文件不是合法 UTF-8 文本')}
 }
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);msg.success('已复制')}catch{msg.error('无法复制到剪贴板')}}
 const output=selected?(preview?.id===selected?preview.value:''):(result?.finalValue??'')
 const validOutput=selected?preview?.id===selected:!!result&&result.finalValue!==null
 const selectedStage=selected?(preview?.id===selected?preview.stage:result?.stages.find(x=>x.id===selected)):undefined
 const previewOutput=output.length>256*1024?output.slice(0,256*1024):output
 const clearPipeline=async()=>{
  if(dirty&&!(await dialog.confirm({title:'清空当前流水线？',description:'当前未保存的步骤修改会被清除。',variant:'warning'})))return
  invalidate();setDraft(blank());setCurrent(null);setBaseline(stamp(blank()));setSelected(null)
 }
 const reorder=({active,over}:DragEndEvent)=>{
  if(!over||over.id===active.id)return
  const a=draft.steps.findIndex(x=>x.id===active.id),b=draft.steps.findIndex(x=>x.id===over.id)
  if(a>=0&&b>=0)setSteps(arrayMove(draft.steps,a,b))
 }
 return <div className="mx-auto max-w-[1700px] space-y-4 p-5">
  <header className="flex flex-wrap items-center gap-3">
   <div className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><ToolPageIcon size={23}/></div>
   <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">编解码</h1><p className="mt-1 text-xs muted">URL / Unicode / Hex / HTML Entity / JSON / Binary / Base64 · 纯本地处理</p></div>
   <div className="flex gap-1 rounded-xl bg-[var(--panel-alt)] p-1">
    <Button size="sm" variant={mode==='quick'?'primary':'ghost'} onClick={()=>changeMode('quick')}>单步快捷</Button>
    <Button size="sm" variant={mode==='pipeline'?'primary':'ghost'} onClick={()=>changeMode('pipeline')}>多步流水线</Button>
   </div>
   <Button onClick={()=>setLibraryOpen(x=>!x)}><FolderOpen size={15}/> 我的流程</Button>
  </header>
  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
   <label className="flex items-center gap-2 text-xs muted">手动执行 <SwitchField ariaLabel="手动执行" checked={manual} onCheckedChange={setManual}/></label>
   {large&&<span className="text-xs text-amber-400">输入超过 1 MiB，自动切换手动执行</span>}
   <Button size="sm" variant="primary" disabled={busy} onClick={()=>void runNow()}><Play size={14}/>{busy?'处理中…':'执行转换'}</Button>
   <Button size="sm" disabled={!busy} onClick={()=>{invalidate()}}><X size={14}/> 取消</Button>
   <Button size="sm" onClick={()=>inputRef.current?.click()}><FileUp size={14}/> 导入文本</Button>
   <Button size="sm" disabled={!validOutput} onClick={()=>{saveText('codec-result.txt',output);setExported(true)}}><Download size={14}/> 导出结果</Button>
   <input ref={inputRef} type="file" className="hidden" accept=".txt,.json,.xml,.html,.csv,.log,.md,.yml,.yaml,.conf,.ini" onChange={e=>{const f=e.target.files?.[0];if(f)void importText(f);e.target.value=''}}/>
   <div className="ml-auto text-xs muted">源文本 {inputBytes.toLocaleString()} / 2 MiB · 步骤 {steps.length} / {MAX_STEPS}</div>
  </div>
  {mode==='quick'&&<section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
   <CodecStepOptions step={quick} onChange={editQuick}/>
  </section>}
  {libraryOpen&&<section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
   <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">我的流程</h2><span className="text-xs muted">{list.length} / 200 份</span>
    <Input aria-label="搜索流程" className="ml-auto max-w-xs" placeholder="搜索名称或描述" value={search} onChange={e=>setSearch(e.target.value)}/>
    <Button size="sm" onClick={()=>void refresh()}><RotateCcw size={14}/> 刷新</Button></div>
   <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
    {list.filter(x=>(x.name+' '+x.description).toLowerCase().includes(search.toLowerCase())).map(item=><div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 space-y-2">
     <div className="text-sm font-semibold">{item.name}</div><div className="text-xs muted">{item.description||'无描述'} · {item.stepCount} 步</div>
     <div className="text-[11px] muted">{new Date(item.updatedAt).toLocaleString()}</div>
     <div className="flex flex-wrap gap-2"><Button size="sm" variant="primary" onClick={()=>void load(item.id)}>加载</Button><Button size="sm" onClick={()=>void duplicate(item)}>复制</Button><Button size="sm" variant="danger" onClick={()=>void remove(item)}>删除</Button></div>
    </div>)}
   </div>
  </section>}
  {mode==='pipeline'&&<section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
   <div className="flex flex-wrap items-center gap-2">
    <Input aria-label="流程名称" className="max-w-xs" placeholder="流程名称（保存前填写）" value={draft.name} maxLength={80} onChange={e=>editDraft({...draft,name:e.target.value})}/>
    <Input aria-label="流程描述" className="max-w-sm" placeholder="可选描述" value={draft.description} maxLength={500} onChange={e=>editDraft({...draft,description:e.target.value})}/>
    {dirty&&<span className="text-xs text-amber-400">未保存</span>}
    <Button size="sm" variant="primary" onClick={()=>void save(false)}><Save size={14}/> {current?'保存修改':'保存新流程'}</Button>
    <Button size="sm" onClick={()=>void save(true)}>另存为</Button>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <SelectField ariaLabel="内置流程模板" value="placeholder" onValueChange={v=>void selectTemplate(Number(v))} options={[{value:'placeholder',label:'选择内置模板'},...codecTemplates.map((x,i)=>({value:String(i),label:x.name,description:x.description}))]}/>
    <Button size="sm" disabled={draft.steps.length>=MAX_STEPS} onClick={()=>setSteps([...draft.steps,makeStep()])}><Plus size={14}/> 添加步骤</Button>
    <Button size="sm" onClick={()=>void clearPipeline()}><Trash2 size={14}/> 清空流程</Button>
    <Button size="sm" onClick={exportConfig}><Download size={14}/> 导出配置</Button>
    <Button size="sm" onClick={()=>configRef.current?.click()}><FileUp size={14}/> 导入配置</Button>
    <input ref={configRef} className="hidden" type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];if(f)void importConfig(f);e.target.value=''}}/>
   </div>
  </section>}
  <div className={mode==='pipeline'?'grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,1.08fr)_minmax(0,1fr)]':'grid gap-4 lg:grid-cols-2'}>
   <section className="min-w-0 space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
    <div className="flex items-center justify-between"><h2 className="text-sm font-medium">原始输入 · UTF-8</h2><Button size="icon" variant="ghost" title="清空输入" onClick={()=>editInput('')}><Trash2 size={14}/></Button></div>
    <CodecTextEditor label="编解码输入" value={input} onChange={editInput} maxBytes={MAX_INPUT_BYTES} onReject={()=>setError("原始输入超过 2 MiB，已拒绝加载")} className="h-[390px]"/>
   </section>
   {mode==='pipeline'&&<section className="min-w-0 space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
    <h2 className="text-sm font-medium">步骤 · 可拖动排序</h2>
    <div className="max-h-[390px] space-y-2 overflow-y-auto pr-1">
     <DndContext collisionDetection={closestCenter} onDragEnd={reorder}>
      <SortableContext items={draft.steps.map(s=>s.id)} strategy={verticalListSortingStrategy}>
       {draft.steps.map((s,i)=><CodecStepCard key={s.id} step={s} index={i} selected={selected===s.id} stage={result?.stages.find(x=>x.id===s.id)}
        onSelect={()=>void previewNow(s.id)} onPreview={()=>void previewNow(s.id)}
        onChange={stepUpdate} onCopy={()=>{if(draft.steps.length<MAX_STEPS)setSteps([...draft.steps.slice(0,i+1),{...s,id:crypto.randomUUID()},...draft.steps.slice(i+1)])}}
        onRemove={()=>setSteps(draft.steps.filter(x=>x.id!==s.id))}/>)}
      </SortableContext>
     </DndContext>
     {!draft.steps.length&&<p className="text-sm muted">当前没有步骤。添加步骤或选择常用模板。</p>}
    </div>
   </section>}
   <section className="min-w-0 space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-medium">{selected?'步骤中间结果':'最终结果'} · 只读</h2>
     <div className="flex gap-1">
      {selected&&<Button size="sm" variant="ghost" onClick={()=>{setSelected(null);setPreview(null)}}>返回最终</Button>}
      {mode==='quick'&&<Button size="icon" variant="ghost" title="交换输入输出" disabled={!validOutput} onClick={()=>{editInput(output);editQuick({...quick,direction:quick.direction==='encode'?'decode':'encode',options:quick.kind==='base64'?{...quick.options,variant:quick.direction==='encode'?'auto':'standard'}:quick.options})}}><ArrowLeftRight size={14}/></Button>}
      {mode==='quick'&&<Button size="sm" variant="ghost" disabled={!validOutput} onClick={()=>editInput(output)}>结果作输入</Button>}
      <Button size="icon" variant="ghost" title="复制结果" disabled={!validOutput} onClick={()=>void copy(output)}><Copy size={14}/></Button>
     </div></div>
    <CodecTextEditor readOnly label="编解码输出" value={previewOutput} className="h-[390px]"/>
    {output.length>previewOutput.length&&<p className="text-xs muted">界面仅展示前 256 KiB；复制和导出使用完整结果。</p>}
    {selectedStage&&<p className="text-xs muted">当前步骤：{selectedStage.status} · {selectedStage.inputBytes.toLocaleString()} → {selectedStage.outputBytes.toLocaleString()} 字节</p>}
    {result&&!result.error&&<p className="text-xs muted">执行完成 · 总耗时 {result.durationMs.toFixed(1)} ms</p>}
   </section>
  </div>
  {error&&<div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-400">{error}</div>}
  <p className="text-xs muted">仅将流程步骤与设置保存到 SQLite，输入、输出和中间结果不持久化。Hex/Base64/Binary 解码必须产生有效 UTF-8 文本。</p>
 </div>
}
