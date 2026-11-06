import {useCallback,useEffect,useRef,useState} from 'react'
import {AlertTriangle,Download,Music2,RefreshCw,Settings2,Subtitles} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {DialogShell} from '@/components/ui/dialog-shell'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {msg} from '@/components/ui/message'
import {DropOverlay,useWindowFileDrop} from '@/hooks/useWindowFileDrop'
import {MediaDropZone} from '@/components/media/MediaDropZone'
import {MediaProcessingOptions} from '@/components/media/MediaProcessingOptions'
import {MediaQueue} from '@/components/media/MediaQueue'
import {ModelManagerDialog} from '@/components/media/ModelManagerDialog'
import type {MediaKind,MediaPreferences,MediaSnapshot} from '@/shared/mediaModels'

export function VideoProcessingPage(){
 const [snapshot,setSnapshot]=useState<MediaSnapshot|null>(null)
 const [kind,setKind]=useState<MediaKind>('extract')
 const [checked,setChecked]=useState<string[]>([])
 const [busy,setBusy]=useState(false)
 const [skipped,setSkipped]=useState<{path:string;reason:string}[]>([])
 const [managerOpen,setManagerOpen]=useState(false)
 const [preview,setPreview]=useState<{id:string;name:string;text:string}|null>(null)
 const mounted=useRef(true),working=useRef(false),revision=useRef(0)
 const api=window.toolDock.media
 const load=useCallback(async()=>{
  const current=++revision.current,next=await window.toolDock.media.status()
  if(mounted.current&&current===revision.current)setSnapshot(next)
 },[])
 useEffect(()=>{
  mounted.current=true
  void load().catch(e=>{if(mounted.current)msg.error(e)})
  const off=api.onChange(()=>{void load().catch(e=>{if(mounted.current)msg.error(e)})})
  return()=>{mounted.current=false;off()}
 },[api,load])
 const run=async(action:()=>Promise<unknown>)=>{
  if(working.current)return
  working.current=true;setBusy(true)
  try{await action();await load()}
  catch(e){if(mounted.current)msg.error(e)}
  finally{working.current=false;if(mounted.current)setBusy(false)}
 }
 const importSources=async(paths:string[])=>{
  if(!paths.length)return
  const result=await api.addSources(paths,kind)
  if(mounted.current)setSkipped(result.skipped)
  const next=await api.status()
  if(mounted.current){setSnapshot(next);setChecked(next.tasks.filter(t=>t.kind===kind&&t.state==='ready').map(t=>t.id))}
  msg[result.skipped.length?'warning':'success'](`添加 ${result.added} 项${result.skipped.length?'，跳过 '+result.skipped.length+' 项':''}`)
 }
 const add=(paths:string[])=>run(()=>importSources(paths))
 const over=useWindowFileDrop(files=>add(files.map(file=>window.toolDock.transfer.pathForDroppedFile(file)).filter(Boolean)),!busy&&!managerOpen&&!preview)
 const pickFiles=()=>run(async()=>{
  const paths=await api.chooseFiles(kind)
  await importSources(paths)
 })
 const pickFolder=()=>run(async()=>{
  const path=await api.chooseFolder();if(!path)return
  await importSources([path])
 })
 const changePrefs=(patch:Partial<MediaPreferences>)=>void run(()=>api.setPreferences(patch))
 const switchKind=(next:MediaKind)=>{setKind(next);setChecked(snapshot?.tasks.filter(t=>t.kind===next&&t.state==='ready').map(t=>t.id)||[]);setSkipped([])}
 const tasks=snapshot?.tasks.filter(t=>t.kind===kind)||[]
 const running=snapshot?.tasks.filter(t=>t.state==='running').length||0
 const queued=snapshot?.tasks.filter(t=>t.state==='queued').length||0
 return <div className="relative min-h-full min-w-0 space-y-5 p-5 lg:p-7">
  <div className="flex flex-wrap items-start gap-3"><div className="rounded-xl bg-indigo-500/10 p-3 text-indigo-400"><ToolPageIcon size={25}/></div><div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">视频处理</h1><p className="mt-1 text-xs leading-5 muted">批量提取音频 · 本地生成 SRT 字幕 · 切换页面后任务继续运行</p></div><Button disabled={!snapshot} onClick={()=>setManagerOpen(true)}><Settings2 size={16}/>模型与引擎</Button><Button size="icon" title="刷新状态" aria-label="刷新视频处理状态" disabled={busy} onClick={()=>void run(load)}><RefreshCw size={16}/></Button></div>
  {!snapshot?<div className="rounded-2xl border border-[var(--border)] p-8 text-sm muted">正在读取媒体工具状态…</div>:<>
   <div className="flex flex-wrap items-center gap-3"><div role="tablist" aria-label="视频处理模式" className="inline-flex gap-1 rounded-xl bg-[var(--panel-alt)] p-1">{([{id:'extract',label:'提取音频',icon:Music2},{id:'subtitle',label:'生成字幕',icon:Subtitles}] as const).map(tab=><button key={tab.id} role="tab" aria-selected={kind===tab.id} aria-controls="media-workspace" id={'media-tab-'+tab.id} onClick={()=>switchKind(tab.id)} className={'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium '+(kind===tab.id?'bg-[var(--panel)] text-indigo-400 shadow-sm':'muted hover:bg-[var(--hover)]')}><tab.icon size={16}/>{tab.label}</button>)}</div><span className="ml-auto text-xs muted">{running?'正在处理 '+running+' 项':queued?'等待处理':'就绪'}{queued?' · 排队 '+queued+' 项':''} · 本地离线处理</span></div>
   <div id="media-workspace" role="tabpanel" aria-labelledby={'media-tab-'+kind} className="space-y-5">
    <MediaDropZone subtitle={kind==='subtitle'} busy={busy} onFiles={()=>void pickFiles()} onFolder={()=>void pickFolder()}/>
    {!!skipped.length&&<details className="rounded-xl border border-amber-500/25 p-3 text-xs"><summary className="cursor-pointer text-amber-500">已跳过 {skipped.length} 项，点击查看原因</summary><div className="mt-2 max-h-48 space-y-2 overflow-auto">{skipped.map((item,index)=><p key={item.path+index} className="break-all muted">{item.path}：{item.reason}</p>)}</div></details>}
    <MediaProcessingOptions kind={kind} prefs={snapshot.preferences} models={snapshot.models} disabled={busy} onChange={changePrefs} onDirectory={()=>void run(async()=>{const path=await api.chooseOutputDirectory();if(path)await api.setPreferences({outputDirectory:path})})} onModels={()=>setManagerOpen(true)}/>
    {kind==='subtitle'&&!snapshot.models.some(model=>model.installed&&model.id===snapshot.preferences.selectedModelId)&&<div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs"><AlertTriangle size={17} className="text-amber-500"/><span className="flex-1 muted">当前模型尚未安装，请先下载或导入模型。</span><Button size="sm" onClick={()=>setManagerOpen(true)}>管理模型</Button></div>}
    <MediaQueue tasks={tasks} checked={checked} busy={busy} onCheck={setChecked} onStart={()=>void run(async()=>{await api.start(checked,snapshot.preferences);setChecked([])})} onCancel={id=>void run(()=>api.cancel(id))} onRetry={id=>void run(()=>api.retry(id))} onTrack={(id,index)=>void run(()=>api.setAudioTrack(id,index))} onOpen={id=>void run(()=>api.openOutput(id))} onPreview={id=>void run(async()=>{const text=await api.preview(id);if(mounted.current)setPreview({id,name:snapshot.tasks.find(t=>t.id===id)?.name||'字幕',text})})} onClear={()=>void run(()=>api.clearFinished())}/>
   </div>
   <ModelManagerDialog open={managerOpen} onOpenChange={setManagerOpen} snapshot={snapshot} busy={busy} run={run} onPreferences={changePrefs}/>
  </>}
  <DialogShell open={!!preview} onOpenChange={open=>{if(!open)setPreview(null)}} width="lg" title={'SRT 字幕预览'+(preview?' · '+preview.name:'')} description="请人工校对 AI 识别结果。字幕已保存在输出目录，可另存一份 SRT。" footer={<><Button onClick={()=>setPreview(null)}>关闭</Button><Button variant="primary" disabled={busy} onClick={()=>void run(async()=>{if(preview){const path=await api.exportSubtitle(preview.id);if(path)msg.success('字幕已导出：'+path)}})}><Download size={15}/>另存 SRT</Button></>}><pre className="min-h-52 whitespace-pre-wrap break-words rounded-xl bg-[var(--panel-alt)] p-4 font-mono text-xs leading-6">{preview?.text}</pre></DialogShell>
  <DropOverlay visible={over} label={'释放以添加'+(kind==='subtitle'?'音视频':'视频')+'或一级文件夹'}/>
 </div>
}
