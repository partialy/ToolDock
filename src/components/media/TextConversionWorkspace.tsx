import {useCallback,useEffect,useRef,useState} from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import {Archive,CheckCheck,Download,FilePlus2,FolderOpen,Languages,LoaderCircle,Play,RefreshCw,RotateCcw,Trash2,Upload,Ellipsis,CheckCircle2,XCircle} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {SelectField} from '@/components/ui/select-field'
import {SwitchField} from '@/components/ui/switch-field'
import {DialogShell} from '@/components/ui/dialog-shell'
import {useDialog} from '@/components/ui/dialog-provider'
import {msg} from '@/components/ui/message'
import {DropOverlay,useWindowFileDrop} from '@/hooks/useWindowFileDrop'
import type {ConversionEncoding,ConversionPreferences,ConversionSnapshot,ConversionTask} from '@/shared/textConversionModels'
import {TextConversionTextPanel} from './TextConversionTextPanel'
import {TextConversionPreviewDialog} from './TextConversionPreviewDialog'
import {TextConversionRowMenu,type RowAction} from './TextConversionRowMenu'

const dirOptions=[{value:'simplify',label:'繁体 → 简体'},{value:'traditional',label:'简体 → 繁体'}]
const regionOptions=[{value:'general',label:'通用文字'},{value:'tw',label:'台湾正体'},{value:'hk',label:'香港繁体'}]
const encodingOptions=[{value:'auto',label:'自动识别'},{value:'utf8',label:'UTF-8'},{value:'gb18030',label:'GB18030'},{value:'big5',label:'Big5'}]
const outputEncodingOptions=[{value:'preserve',label:'保留原编码'},{value:'utf8',label:'统一 UTF-8'}]
const statusLabels:Record<ConversionTask['state'],string>={ready:'待转换',queued:'排队中',running:'转换中',completed:'已完成',failed:'转换失败',cancelled:'已取消'}
const bytes=(n:number)=>n>=1024*1024?(n/1024/1024).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':n+' B'

export function TextConversionWorkspace({active}:{active:boolean}){
 const api=window.toolDock.textConversion,dialog=useDialog()
 const [snapshot,setSnapshot]=useState<ConversionSnapshot|null>(null)
 const [selected,setSelected]=useState<string[]>([])
 const [busy,setBusy]=useState(false)
 const [draftSuffix,setDraftSuffix]=useState('')
 const [skipped,setSkipped]=useState<{path:string;reason:string}[]>([])
 const [preview,setPreview]=useState<ConversionTask|null>(null)
 const [renaming,setRenaming]=useState<ConversionTask|null>(null),[name,setName]=useState('')
 const [encodingTask,setEncodingTask]=useState<ConversionTask|null>(null),[taskEncoding,setTaskEncoding]=useState<ConversionEncoding>('auto')
 const revision=useRef(0),mounted=useRef(true),working=useRef(false)
 const load=useCallback(async()=>{
  const rev=++revision.current,s=await window.toolDock.textConversion.status()
  if(mounted.current&&rev===revision.current)setSnapshot(s)
 },[])
 useEffect(()=>{
  mounted.current=true;void load().catch(e=>msg.error(e))
  const off=api.onChange(()=>{void load().catch(e=>{if(mounted.current)msg.error(e)})})
  return()=>{mounted.current=false;off()}
 },[api,load])
 const run=async(fn:()=>Promise<unknown>)=>{
  if(working.current)return
  working.current=true;setBusy(true)
  try{await fn();await load()}catch(e){msg.error(e)}
  finally{working.current=false;if(mounted.current)setBusy(false)}
 }
 const importSources=async(paths:string[])=>{
  if(!paths.length)return
  await run(async()=>{
   const previous=new Set((await api.status()).tasks.map(t=>t.id))
   const result=await api.addSources(paths)
   const fresh=await api.status()
   if(mounted.current){
    setSnapshot(fresh);setSkipped(result.skipped)
    setSelected(curr=>[...new Set([...curr,...fresh.tasks.filter(t=>!previous.has(t.id)).map(t=>t.id)])])
   }
   msg[result.skipped.length?'warning':'success']('添加 '+result.added+' 项'+(result.skipped.length?'，跳过 '+result.skipped.length+' 项':''))
  })
 }
 const drop=useWindowFileDrop(files=>importSources(files.map(f=>window.toolDock.transfer.pathForDroppedFile(f)).filter(Boolean)),active&&!busy&&!preview&&!renaming&&!encodingTask)
 const tasks=snapshot?.tasks||[],preferences=snapshot?.preferences
 useEffect(()=>{setDraftSuffix(snapshot?.preferences.suffix||'')},[snapshot?.preferences.suffix])
 const checked=new Set(selected),all=tasks.length>0&&tasks.every(t=>checked.has(t.id))
 const allIds=tasks.map(t=>t.id)
 const patch=(p:Partial<ConversionPreferences>)=>void run(()=>api.setPreferences(p))
 const pick=()=>void run(async()=>{
  const paths=await api.chooseFiles()
  if(!paths.length)return
  const previous=new Set((await api.status()).tasks.map(t=>t.id))
  const result=await api.addSources(paths),fresh=await api.status()
  setSnapshot(fresh);setSkipped(result.skipped);setSelected(curr=>[...new Set([...curr,...fresh.tasks.filter(t=>!previous.has(t.id)).map(t=>t.id)])])
  msg[result.skipped.length?'warning':'success']('添加 '+result.added+' 项'+(result.skipped.length?'，跳过 '+result.skipped.length+' 项':''))
 })
 const pickFolder=()=>void run(async()=>{
  const folder=await api.chooseFolder()
  if(!folder)return
  const previous=new Set((await api.status()).tasks.map(t=>t.id))
  const result=await api.addSources([folder]),fresh=await api.status()
  setSnapshot(fresh);setSkipped(result.skipped);setSelected(curr=>[...new Set([...curr,...fresh.tasks.filter(t=>!previous.has(t.id)).map(t=>t.id)])])
  msg[result.skipped.length?'warning':'success']('添加 '+result.added+' 项'+(result.skipped.length?'，跳过 '+result.skipped.length+' 项':''))
 })
 const start=(force=false)=>void run(()=>api.start(selected,force))
 const removeSelected=async()=>{
  if(!selected.length)return
  if(!await dialog.confirm({title:'移除选中的文件？',description:'将移除 '+selected.length+' 项任务，并清理尚未导出的临时结果。已保存到用户目录的文件不会删除。',variant:'danger',confirmText:'确认移除'}))return
  void run(async()=>{await api.remove(selected);setSelected([])})
 }
 const saveMany=()=>void run(async()=>{
  const report=await api.saveSelected(selected)
  if(report)msg[report.failed.length||report.skipped?'warning':'success']('已保存 '+report.saved.length+' 个文件'+(report.skipped?'，跳过 '+report.skipped+' 项':'')+(report.failed.length?'，失败 '+report.failed.length+' 项：'+report.failed.map(x=>x.name+' '+x.reason).join('；'):''))
 })
 const zip=()=>void (async()=>{
  const finished=tasks.filter(t=>selected.includes(t.id)&&t.state==='completed').length
  if(!finished){msg.warning('请选择已完成的文件');return}
  const skippedCount=selected.length-finished
  if(skippedCount&&!await dialog.confirm({title:'部分文件尚未完成',description:'将只打包已完成的 '+finished+' 项，跳过 '+skippedCount+' 项待处理或失败文件。',confirmText:'继续打包'}))return
  await run(async()=>{const result=await api.saveZip(selected);if(result)msg.success('压缩包已保存：'+result)})
 })
 const rowAction=(t:ConversionTask,action:RowAction)=>{
  if(action==='convert')void run(()=>api.start([t.id]))
  if(action==='reconvert')void run(()=>api.start([t.id],true))
  if(action==='preview')setPreview(t)
  if(action==='rename'){setRenaming(t);setName(t.outputName.slice(0,-(t.name.split('.').pop()!.length+1)))}
  if(action==='encoding'){setEncodingTask(t);setTaskEncoding(t.encodingOverride||preferences?.inputEncoding||'auto')}
  if(action==='save')void run(async()=>{const result=await api.saveOne(t.id);if(result)msg.success('文件已保存：'+result)})
  if(action==='cancel')void run(()=>api.cancel(t.id))
  if(action==='remove')void (async()=>{
   if(t.state==='running'&&!await dialog.confirm({title:'取消并移除任务？',description:'正在处理的文件会先停止，导出的文件不会被删除。',variant:'danger',confirmText:'移除任务'}))return
   await run(async()=>{await api.remove([t.id]);setSelected(items=>items.filter(id=>id!==t.id))})
  })()
 }
 const rename=()=>void run(async()=>{if(!renaming)return;await api.rename(renaming.id,name);setRenaming(null);msg.success('输出名称已更新')})
 const setEncoding=()=>void run(async()=>{if(!encodingTask)return;await api.setEncoding(encodingTask.id,taskEncoding);setEncodingTask(null);msg.success('输入编码已更新，可重新转换')})
 return <div className="min-w-0 space-y-5">
  {!preferences?<div className="rounded-xl border border-[var(--border)] p-6 text-sm muted">正在加载简繁转换设置…</div>:<>
  <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 lg:p-5">
   <div className="mb-4 flex items-center gap-2"><Languages size={17} className="text-indigo-400"/><h2 className="text-sm font-semibold">转换设置</h2><span className="ml-auto text-xs muted">所有转换均在本机离线完成</span></div>
   <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
    <div className="min-w-0 space-y-1.5"><label className="text-xs muted">转换方向</label><SelectField ariaLabel="转换方向" value={preferences.direction} options={dirOptions} onValueChange={v=>patch({direction:v as ConversionPreferences['direction']})} disabled={busy}/></div>
    <div className="min-w-0 space-y-1.5"><label className="text-xs muted">地区标准</label><SelectField ariaLabel="地区标准" value={preferences.region} options={regionOptions} onValueChange={v=>patch({region:v as ConversionPreferences['region']})} disabled={busy}/></div>
    <div className="min-w-0 space-y-1.5"><label className="text-xs muted">输入编码</label><SelectField ariaLabel="输入编码" value={preferences.inputEncoding} options={encodingOptions} onValueChange={v=>patch({inputEncoding:v as ConversionEncoding})} disabled={busy}/></div>
    <div className="min-w-0 space-y-1.5"><label className="text-xs muted">输出编码</label><SelectField ariaLabel="输出编码" value={preferences.outputEncoding} options={outputEncodingOptions} onValueChange={v=>patch({outputEncoding:v as ConversionPreferences['outputEncoding']})} disabled={busy}/></div>
    <div className="min-w-0 space-y-1.5"><label className="text-xs muted">输出后缀（留空采用默认）</label><input value={draftSuffix} onChange={e=>setDraftSuffix(e.target.value)} onBlur={()=>patch({suffix:draftSuffix})} placeholder={preferences.direction==='simplify'?'_simplify':'_traditional'} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-xs outline-none focus:border-indigo-500"/></div>
   </div>
   <label className="mt-4 inline-flex items-center gap-3 text-xs muted">地区习惯用语转换<SwitchField ariaLabel="地区习惯用语转换" checked={preferences.phraseConversion} onCheckedChange={v=>patch({phraseConversion:v})} disabled={busy}/><span>默认关闭，避免自动替换软件、硬件等地区词语</span></label>
  </section>
  <TextConversionTextPanel preferences={preferences}/>
  <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
   <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-4">
    <h2 className="mr-auto text-sm font-semibold">文件转换 <span className="text-xs font-normal muted">· {tasks.length} / 100 项</span></h2>
    <Button size="sm" disabled={busy} onClick={pick}><FilePlus2 size={15}/>选择文件</Button>
    <Button size="sm" disabled={busy} onClick={pickFolder}><FolderOpen size={15}/>选择文件夹</Button>
   </div>
   <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--panel-alt)] px-4 py-3">
    <Button size="sm" disabled={!tasks.length} onClick={()=>setSelected(all?[]:allIds)}><CheckCheck size={14}/>{all?'取消全选':'全选'}</Button>
    <Button size="sm" disabled={!tasks.length} onClick={()=>setSelected(allIds.filter(id=>!checked.has(id)))}><RotateCcw size={14}/>反选</Button>
    <span className="text-xs muted">已选择 {selected.filter(id=>tasks.some(t=>t.id===id)).length} 项</span>
    <Menu.Root><Menu.Trigger asChild><Button size="sm" disabled={!selected.length||busy}><Ellipsis size={15}/>操作</Button></Menu.Trigger><Menu.Portal><Menu.Content sideOffset={6} align="start" className="z-[350] min-w-48 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-xl">
     {([{label:'处理选中',icon:Play,run:()=>start(false)},{label:'重新转换选中',icon:RefreshCw,run:()=>start(true)},{label:'批量保存',icon:Download,run:saveMany},{label:'打包下载 ZIP',icon:Archive,run:zip},{label:'移除选中',icon:Trash2,run:()=>void removeSelected()}] as const).map(x=><Menu.Item key={x.label} onSelect={x.run} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs outline-none data-[highlighted]:bg-[var(--hover)]"><x.icon size={15}/>{x.label}</Menu.Item>)}
    </Menu.Content></Menu.Portal></Menu.Root>
    <span className="ml-auto text-xs muted">转换并发 2 · 单文件 ≤ 50 MiB · 队列总量 ≤ 500 MiB</span>
   </div>
   {!!skipped.length&&<details className="border-b border-amber-500/20 px-4 py-3 text-xs"><summary className="cursor-pointer text-amber-500">已跳过 {skipped.length} 项，点击查看原因</summary>{skipped.map((item,i)=><div key={i} className="mt-1 break-all muted">{item.path} · {item.reason}</div>)}</details>}
   <div className="grid grid-cols-1 gap-0 border-b border-[var(--border)] bg-[var(--panel-alt)] text-xs font-semibold md:grid-cols-2"><div className="px-4 py-3">输入文件</div><div className="border-t border-[var(--border)] px-4 py-3 md:border-l md:border-t-0">输出文件</div></div>
   {!tasks.length?<div className="flex flex-col items-center gap-3 px-5 py-14 text-center"><Upload size={30} className="muted opacity-70"/><p className="text-sm">还未选择文件，拖动文件到窗口开始使用</p><p className="text-xs muted">支持 TXT、MD、SRT、VTT、LRC；可选择多个文件或整个文件夹</p></div>:
    <div className="max-h-[520px] overflow-y-auto divide-y divide-[var(--border)]">{tasks.map(t=><div key={t.id} className="grid min-w-0 grid-cols-1 md:grid-cols-2">
     <div className="flex min-w-0 items-start gap-2.5 px-4 py-3"><input type="checkbox" aria-label={'选择 '+t.name} checked={checked.has(t.id)} onChange={e=>setSelected(v=>e.target.checked?[...new Set([...v,t.id])]:v.filter(id=>id!==t.id))} className="mt-1 h-4 w-4 accent-indigo-500"/><FilePlus2 size={17} className="mt-0.5 shrink-0 text-indigo-400"/><div className="min-w-0 flex-1"><p title={t.inputPath} className="truncate text-sm font-medium">{t.name}</p><p className="mt-1 truncate text-xs muted" title={t.inputPath}>{bytes(t.size)} · {t.inputPath}</p>{t.encodingOverride&&<p className="mt-1 text-xs muted">输入编码：{t.encodingOverride}</p>}</div></div>
     <div className="flex min-w-0 items-start gap-2.5 border-t border-[var(--border)] px-4 py-3 md:border-l md:border-t-0"><div className="mt-0.5 shrink-0">{t.state==='completed'?<CheckCircle2 size={17} className="text-emerald-500"/>:t.state==='failed'?<XCircle size={17} className="text-red-400"/>:t.state==='running'?<LoaderCircle size={17} className="animate-spin text-indigo-400"/>:<FilePlus2 size={17} className="muted"/>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={t.outputName}>{t.outputName}</p><p className={'mt-1 text-xs '+(t.state==='failed'?'text-red-400':'muted')}>{statusLabels[t.state]}{t.state==='running'?' · '+t.percent+'%':''}{t.detectedEncoding?' · '+t.detectedEncoding:''}{t.outputBytes!==undefined?' · '+bytes(t.outputBytes):''}</p>{t.state==='running'&&<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--panel-alt)]"><div style={{width:t.percent+'%'}} className="h-full rounded-full bg-indigo-500"/></div>}{t.error&&<p role="alert" className="mt-1 break-words text-xs text-red-400">{t.error}</p>}</div><TextConversionRowMenu task={t} onAction={action=>rowAction(t,action)}/></div>
    </div>)}</div>}
  </section>
  </>}
  <DialogShell open={!!renaming} onOpenChange={v=>{if(!v)setRenaming(null)}} title="修改输出文件名" description={'仅修改文件主名，扩展名保持不变。'+(renaming?' 当前：'+renaming.outputName:'')} width="sm" footer={<><Button onClick={()=>setRenaming(null)}>取消</Button><Button variant="primary" disabled={!name||busy} onClick={rename}>保存</Button></>}><input autoFocus value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')rename()}} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-sm outline-none focus:border-indigo-500"/></DialogShell>
  <DialogShell open={!!encodingTask} onOpenChange={v=>{if(!v)setEncodingTask(null)}} title="设置单文件输入编码" description={'仅作用于所选文件，重新转换后生效。'+(encodingTask?' · '+encodingTask.name:'')} width="sm" footer={<><Button onClick={()=>setEncodingTask(null)}>取消</Button><Button variant="primary" onClick={setEncoding}>确定</Button></>}><SelectField ariaLabel="单文件输入编码" value={taskEncoding} options={encodingOptions} onValueChange={v=>setTaskEncoding(v as ConversionEncoding)}/></DialogShell>
  <TextConversionPreviewDialog task={preview?tasks.find(t=>t.id===preview.id)||preview:null} onClose={()=>setPreview(null)}/>
  <DropOverlay visible={drop&&active} label="释放以添加 TXT、MD、SRT、VTT、LRC 文件或一级文件夹"/>
 </div>
}
