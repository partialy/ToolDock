import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {ArrowLeft,Download,Pause,Play,Redo2,Scissors,Undo2,ZoomIn,ZoomOut} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {SelectField} from '@/components/ui/select-field'
import {msg} from '@/components/ui/message'
import {AudioWaveformTimeline} from './AudioWaveformTimeline'
import {AudioExportDialog} from './AudioExportDialog'
import {canonicalKept,estimatedDurationUs,keepInterval,subtractInterval,type AudioProject,type AudioEdit,type AudioRange} from '@/shared/audioEditingModels'
import type {MediaPreferences} from '@/shared/mediaModels'
import {deletedRanges,formatAudioTime,parseAudioTime,toOriginalTime,toOutputTime} from '@/lib/audio-editing/time'

export function AudioEditorWorkspace({project,prefs,directory,onBack,onUpdated}:{
 project:AudioProject;prefs:MediaPreferences;directory:string;onBack:()=>void;onUpdated:()=>void
}){
 const stream=project.source.streams.find(s=>s.index===project.streamIndex)!
 const durationUs=stream.durationUs
 const [edit,setEdit]=useState<AudioEdit>(()=>structuredClone(project.edit)),[outputName,setOutputName]=useState(project.outputName)
 const [selection,setSelection]=useState<AudioRange|null>(null),[startText,setStartText]=useState('00:00:00.00'),[endText,setEndText]=useState('00:00:00.00')
 const [quickText,setQuickText]=useState('5'),[zoom,setZoom]=useState(1),[viewStartUs,setViewStartUs]=useState(0)
 const [peaks,setPeaks]=useState<number[]>([]),[peakState,setPeakState]=useState(''),[playhead,setPlayhead]=useState(0)
 const [playback,setPlayback]=useState<'original'|'edited'>('original'),[audioUrl,setAudioUrl]=useState(''),[previewBusy,setPreviewBusy]=useState(false)
 const [saveState,setSaveState]=useState('已保存'),[exportOpen,setExportOpen]=useState(false)
 const [undo,setUndo]=useState<AudioEdit[]>([]),[redo,setRedo]=useState<AudioEdit[]>([])
 const audioRef=useRef<HTMLAudioElement>(null),revision=useRef(project.revision)
 const draft=useRef({edit,outputName}),saved=useRef(JSON.stringify({edit:project.edit,outputName:project.outputName}))
 const chain=useRef<Promise<void>>(Promise.resolve()),persistRef=useRef<()=>Promise<void>>(async()=>{})
 draft.current={edit,outputName}
 useEffect(()=>{revision.current=project.revision;draft.current={edit:structuredClone(project.edit),outputName:project.outputName}},[project.id])
 const persist=useCallback(async()=>{
  const data=structuredClone(draft.current),encoded=JSON.stringify(data)
  if(encoded===saved.current){setSaveState('已保存');return}
  setSaveState('保存中…')
  const pending=chain.current.catch(()=>{}).then(async()=>{
   if(encoded===saved.current)return
   const result=await window.toolDock.audio.save(project.id,revision.current,data.edit,data.outputName)
   revision.current=result.revision;saved.current=encoded
   onUpdated()
  })
  chain.current=pending
  try{await pending;setSaveState(encoded===JSON.stringify(draft.current)?'已保存':'待保存')}
  catch(e){setSaveState('保存失败 · 请重试');throw e}
 },[project.id,onUpdated])
 persistRef.current=persist
 useEffect(()=>{
  if(JSON.stringify({edit,outputName})===saved.current)return
  setSaveState('待保存')
  const timer=setTimeout(()=>void persist().catch(e=>msg.error(e)),500)
  return()=>clearTimeout(timer)
 },[edit,outputName,persist])
 useEffect(()=>()=>{void persistRef.current().catch(()=>{})},[project.id])
 useEffect(()=>{
  let active=true;setPeaks([]);setPeakState('正在生成波形…')
  const timer=setTimeout(()=>{
   void window.toolDock.audio.peaks(project.id,viewStartUs,Math.min(durationUs,viewStartUs+durationUs/zoom),600)
    .then(r=>{if(active){setPeaks(r.points);setPeakState('')}})
    .catch(e=>{if(active){setPeakState('波形不可用，可用时间输入剪辑');msg.warning(e)}})
  },320)
  return()=>{active=false;clearTimeout(timer)}
 },[project.id,durationUs,zoom,viewStartUs])
 useEffect(()=>{setAudioUrl('');audioRef.current?.pause()},[edit,playback])
 const update=(next:AudioEdit)=>{
  setUndo(previous=>[...previous.slice(-99),structuredClone(edit)])
  setRedo([]);setEdit(next)
 }
 const undoAction=()=>{
  if(!undo.length)return
  const previous=undo.at(-1)!;setUndo(x=>x.slice(0,-1));setRedo(x=>[...x.slice(-99),structuredClone(edit)]);setEdit(previous)
 }
 const redoAction=()=>{
  if(!redo.length)return
  const next=redo.at(-1)!;setRedo(x=>x.slice(0,-1));setUndo(x=>[...x.slice(-99),structuredClone(edit)]);setEdit(next)
 }
 const applySelection=(mode:'delete'|'keep')=>{
  const range=selection||{startUs:parseAudioTime(startText)||0,endUs:parseAudioTime(endText)||0}
  if(range.endUs<=range.startUs){msg.warning('请先拖动选择或输入有效的开始和结束时间');return}
  try{const kept=mode==='delete'?subtractInterval(edit.kept,range,durationUs):keepInterval(edit.kept,range,durationUs)
   update({...edit,kept});setSelection(null)
  }catch(e){msg.error(e)}
 }
 const quick=(action:'delete-start'|'delete-end'|'keep-start'|'keep-end')=>{
  const n=parseAudioTime(quickText)
  if(!n||n>=durationUs){msg.warning('请输入小于音轨总时长的有效秒数');return}
  const range=action.endsWith('start')?{startUs:0,endUs:n}:{startUs:durationUs-n,endUs:durationUs}
  try{
   update({...edit,kept:action.startsWith('delete')?subtractInterval(edit.kept,range,durationUs):keepInterval(edit.kept,range,durationUs)})
  }catch(e){msg.error(e)}
 }
 const seek=(us:number)=>{
  setPlayhead(us)
  const element=audioRef.current
  if(element&&audioUrl)element.currentTime=(playback==='original'?us:toOutputTime(us,edit))/1e6
 }
 const listen=async(mode:'original'|'edited')=>{
  if(mode!==playback){setPlayback(mode);setAudioUrl('');if(mode==='edited'){setZoom(1);setViewStartUs(0)}}
  setPreviewBusy(true)
  try{const url=await window.toolDock.audio.preview(project.id,mode==='edited');setAudioUrl(url)}
  catch(e){msg.warning(e)}finally{setPreviewBusy(false)}
 }
 const close=async()=>{
  try{await persist();onBack()}catch(e){msg.error(e)}
 }
 const selected=(r:AudioRange)=>{
  setSelection(r);setStartText(formatAudioTime(r.startUs));setEndText(formatAudioTime(r.endUs))
 }
 const keyboardHandler=useRef<(e:KeyboardEvent)=>void>(()=>{})
 keyboardHandler.current=(e:KeyboardEvent)=>{
  if(exportOpen||e.altKey||e.metaKey||e.target instanceof Element&&e.target.closest('input,textarea,select,button,[contenteditable="true"]'))return
  if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();undoAction()}
  else if(e.ctrlKey&&e.key.toLowerCase()==='y'){e.preventDefault();redoAction()}
  else if(!e.ctrlKey&&e.key==='Delete'){e.preventDefault();applySelection('delete')}
  else if(!e.ctrlKey&&e.key===' '){e.preventDefault();const player=audioRef.current;if(player){if(player.paused)void player.play().catch(()=>{});else player.pause()}}
  else if(!e.ctrlKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();seek(Math.max(0,Math.min(durationUs,playhead+(e.key==='ArrowLeft'?-100000:100000))))}
 }
 useEffect(()=>{
  const handler=(event:KeyboardEvent)=>keyboardHandler.current(event)
  window.addEventListener('keydown',handler)
  return()=>window.removeEventListener('keydown',handler)
 },[])
 const estimated=estimatedDurationUs(edit)
 const finishedPeaks=useMemo(()=>{
  if(!peaks.length||!estimated||zoom!==1)return[]
  return Array.from({length:Math.min(600,peaks.length)},(_,i)=>{
   const outputUs=(i+.5)*estimated/Math.min(600,peaks.length)
   const origin=toOriginalTime(outputUs,edit)
   return peaks[Math.min(peaks.length-1,Math.max(0,Math.floor(origin/durationUs*peaks.length)))]||0
  })
 },[peaks,edit,estimated,durationUs,zoom])
 return <div className="space-y-5">
  <div className="flex flex-wrap items-center gap-3">
   <Button onClick={()=>void close()}><ArrowLeft size={16}/>返回工程列表</Button>
   <div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold">{project.displayName}</h2><p className="text-xs muted">音轨 {stream.index} · {stream.codec} · {(stream.sampleRate/1000).toFixed(1)}kHz · {stream.channels} 声道</p></div>
   <span className={'text-xs '+(saveState.startsWith('保存失败')?'text-red-400':'muted')}>{saveState}</span>
   <Button variant="primary" onClick={()=>void persist().then(()=>setExportOpen(true)).catch(e=>msg.error(e))}><Download size={15}/>导出</Button>
  </div>
  <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
   <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
    <span className="muted">原始时长 {formatAudioTime(durationUs)} · 删除 {formatAudioTime(durationUs-edit.kept.reduce((n,r)=>n+r.endUs-r.startUs,0))}</span>
    <strong>预计输出 {formatAudioTime(estimated)}</strong>
   </div>
   <p className="text-xs muted">当前时间轴：{playback==='original'?'原始音轨 · 支持选择和删除':'剪辑成品 · 只读预览，切回原始试听可继续选择片段'}</p>
   <AudioWaveformTimeline points={playback==='original'?peaks:finishedPeaks} durationUs={playback==='original'?durationUs:estimated}
    kept={playback==='original'?edit.kept:[{startUs:0,endUs:estimated}]}
    selection={playback==='original'?selection:null} playheadUs={playback==='original'?playhead:toOutputTime(playhead,edit)}
    zoom={playback==='original'?zoom:1} viewStartUs={playback==='original'?viewStartUs:0}
    onSelect={playback==='original'?selected:()=>{}} onSeek={us=>seek(playback==='original'?us:toOriginalTime(us,edit))}
    onZoom={v=>{if(playback==='original'){setZoom(v);setViewStartUs(0)}}}/>
   {peakState&&<p className="text-xs muted">{peakState}</p>}
   <div className="flex flex-wrap items-center gap-3">
    <Button size="sm" disabled={playback==='edited'||zoom<=1} onClick={()=>{setZoom(x=>Math.max(1,x/2));setViewStartUs(0)}}><ZoomOut size={15}/></Button>
    <span className="text-xs muted">{zoom.toFixed(0)}×</span>
    <Button size="sm" disabled={playback==='edited'||zoom>=32} onClick={()=>setZoom(x=>Math.min(32,x*2))}><ZoomIn size={15}/></Button>
    <input aria-label="波形时间轴滚动" type="range" min={0} max={Math.max(0,Math.round(durationUs-durationUs/zoom))} step={10000} value={viewStartUs}
     disabled={playback==='edited'||zoom===1} onChange={e=>setViewStartUs(Number(e.target.value))} className="min-w-24 flex-1 accent-indigo-500"/>
    <Button size="sm" onClick={undoAction} disabled={!undo.length}><Undo2 size={15}/>撤销</Button>
    <Button size="sm" onClick={redoAction} disabled={!redo.length}><Redo2 size={15}/>重做</Button>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" onClick={()=>void listen('original')} disabled={previewBusy} variant={playback==='original'?'primary':'secondary'}><Play size={14}/>原始试听</Button>
    <Button size="sm" onClick={()=>void listen('edited')} disabled={previewBusy} variant={playback==='edited'?'primary':'secondary'}><Play size={14}/>成品试听</Button>
    {previewBusy&&<span className="text-xs muted">正在生成试听缓存…</span>}
    <audio ref={audioRef} controls preload="none" src={audioUrl||undefined} onTimeUpdate={e=>{
     const us=Math.round(e.currentTarget.currentTime*1e6);setPlayhead(playback==='original'?us:toOriginalTime(us,edit))
    }} className="h-9 min-w-52 flex-1"/>
   </div>
  </section>
  <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
   <h3 className="text-sm font-semibold">剪辑片段</h3>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label className="space-y-1 text-xs muted">选择起点<input value={startText} onChange={e=>{setStartText(e.target.value);setSelection(null)}} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 font-mono text-sm text-[var(--foreground)]"/></label>
    <label className="space-y-1 text-xs muted">选择终点<input value={endText} onChange={e=>{setEndText(e.target.value);setSelection(null)}} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 font-mono text-sm text-[var(--foreground)]"/></label>
   </div>
   <div className="flex flex-wrap gap-2"><Button size="sm" variant="primary" onClick={()=>applySelection('delete')}><Scissors size={15}/>删除区间</Button><Button size="sm" onClick={()=>applySelection('keep')}>仅保留区间</Button><Button size="sm" onClick={()=>{update({...edit,kept:[{startUs:0,endUs:durationUs}]});setSelection(null)}}>清除所有剪辑</Button></div>
   <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
    <span className="text-xs muted">快捷操作 N：</span><input aria-label="剪辑秒数" value={quickText} onChange={e=>setQuickText(e.target.value)} className="h-9 w-28 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-sm"/>
    {(['delete-start','delete-end','keep-start','keep-end'] as const).map((action,i)=><Button key={action} size="sm" onClick={()=>quick(action)}>{['删除前N秒','删除后N秒','保留前N秒','保留后N秒'][i]}</Button>)}
   </div>
   <div className="space-y-2"><p className="text-xs muted">已删除区间（点击定位）</p>
    {deletedRanges(edit.kept,durationUs).length===0?<p className="text-xs muted">当前保留完整音轨</p>:
    deletedRanges(edit.kept,durationUs).map((r,i)=><div key={i} className="mr-2 mb-2 inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-400">
     <button className="px-1 py-1" onClick={()=>{selected(r);seek(r.startUs)}} title="选中并定位删除区间">{formatAudioTime(r.startUs)} — {formatAudioTime(r.endUs)}</button>
     <Button size="sm" variant="ghost" onClick={()=>{try{update({...edit,kept:canonicalKept([...edit.kept,r],durationUs)});setSelection(null)}catch(e){msg.error(e)}}}>恢复</Button>
    </div>)}
   </div>
  </section>
  <section className="grid grid-cols-1 gap-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 sm:grid-cols-2">
   <label className="space-y-2 text-xs muted">衔接淡化时间 <span className="font-semibold text-[var(--foreground)]">{edit.fadeMs}ms</span><input type="range" min={0} max={100} step={1} value={edit.fadeMs} onChange={e=>update({...edit,fadeMs:Number(e.target.value)})} className="block w-full accent-indigo-500"/></label>
   <label className="space-y-2 text-xs muted">音量处理<SelectField ariaLabel="音量处理模式" value={edit.effect} onValueChange={v=>update({...edit,effect:v as AudioEdit['effect']})} options={[{value:'none',label:'不处理'},{value:'gain',label:'整段音量调整'},{value:'normalize',label:'响度归一化'}]}/></label>
   {edit.effect==='gain'&&<label className="space-y-2 text-xs muted">音量增益 {edit.gainDb}dB<input type="range" min={-20} max={20} step={1} value={edit.gainDb} onChange={e=>update({...edit,gainDb:Number(e.target.value)})} className="block w-full accent-indigo-500"/></label>}
   {edit.effect==='normalize'&&<label className="space-y-2 text-xs muted">目标响度 {edit.loudnessLUFS} LUFS<input type="range" min={-36} max={-8} step={1} value={edit.loudnessLUFS} onChange={e=>update({...edit,loudnessLUFS:Number(e.target.value)})} className="block w-full accent-indigo-500"/></label>}
   <label className="space-y-2 text-xs muted">输出主文件名<input value={outputName} onChange={e=>setOutputName(e.target.value)} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-sm"/></label>
  </section>
  <AudioExportDialog open={exportOpen} onOpenChange={setExportOpen} projects={[{...project,edit,outputName,revision:revision.current}]} prefs={prefs} directory={directory} onDone={onUpdated}/>
 </div>
}
