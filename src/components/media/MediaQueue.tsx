import {CheckCircle2,FileAudio,FolderOpen,Play,RefreshCw,Square,Subtitles,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {SelectField} from '@/components/ui/select-field'
import type {MediaTask,MediaTaskState} from '@/shared/mediaModels'
import {MediaProgress} from './media-ui'

const labels:Record<MediaTaskState,string>={ready:'待开始',queued:'排队中',running:'处理中',completed:'已完成',failed:'失败',cancelled:'已取消',interrupted:'意外中断'}
const duration=(seconds:number)=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0')
export function MediaQueue({tasks,checked,busy,onCheck,onStart,onCancel,onRetry,onTrack,onOpen,onPreview,onClear}:{tasks:MediaTask[];checked:string[];busy:boolean;onCheck:(ids:string[])=>void;onStart:()=>void;onCancel:(id:string)=>void;onRetry:(id:string)=>void;onTrack:(id:string,index:number)=>void;onOpen:(id:string)=>void;onPreview:(id:string)=>void;onClear:()=>void}){
 const ready=tasks.filter(t=>t.state==='ready'),allChecked=ready.length>0&&ready.every(t=>checked.includes(t.id))
 return <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
  <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-4"><h2 className="mr-auto text-sm font-semibold">文件队列 <span className="ml-1 text-xs font-normal muted">{tasks.length}</span></h2><Button size="sm" disabled={busy||!tasks.some(t=>['completed','failed','cancelled','interrupted'].includes(t.state))} onClick={onClear}><Trash2 size={14}/>清除结束记录</Button><Button size="sm" variant="primary" disabled={busy||!checked.some(id=>ready.some(t=>t.id===id))} onClick={onStart}><Play size={14}/>开始选中任务</Button></div>
  {tasks.length===0?<div className="flex flex-col items-center gap-3 px-6 py-14 text-center muted"><FileAudio size={30} className="opacity-50"/><p className="text-sm">添加文件，开始本地处理</p><p className="text-xs">音频提取最多并行 2 项，字幕识别串行执行</p></div>:<>
   <label className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3 text-xs muted"><input type="checkbox" checked={allChecked} disabled={!ready.length||busy} onChange={e=>onCheck(e.target.checked?ready.map(t=>t.id):[])} className="accent-indigo-500"/>全选待开始任务</label>
   <div className="divide-y divide-[var(--border)]">{tasks.map(task=><article key={task.id} className="flex gap-3 px-5 py-4">
    <input aria-label={'选择 '+task.name} type="checkbox" checked={checked.includes(task.id)} disabled={task.state!=='ready'||busy} onChange={e=>onCheck(e.target.checked?[...checked,task.id]:checked.filter(id=>id!==task.id))} className="mt-1 h-4 w-4 shrink-0 accent-indigo-500"/>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span title={task.inputPath} className="min-w-0 flex-1 break-all text-sm font-medium">{task.name}</span><span className={'text-xs '+(task.state==='failed'?'text-red-400':task.state==='completed'?'text-emerald-500':'muted')}>{task.state==='completed'&&<CheckCircle2 size={12} className="mr-1 inline"/>}{labels[task.state]}{task.state==='running'?' '+Math.round(task.percent)+'%':''}</span></div>
     <p title={task.inputPath} className="mt-1 truncate text-xs muted">{task.inputPath}</p>
     <div className="mt-2 flex flex-wrap items-center gap-3"><span className="text-xs muted">{duration(task.probe.duration)} · {task.probe.audioTracks.length} 条音轨</span><SelectField ariaLabel={task.name+' 的音轨'} value={String(task.audioIndex)} className="h-8 min-w-[160px]" disabled={busy||task.state!=='ready'} onValueChange={v=>onTrack(task.id,Number(v))} options={task.probe.audioTracks.map((track,index)=>({value:String(track.index),label:`音轨 ${index+1} · ${track.codec}${track.language?' · '+track.language:''}${track.title?' · '+track.title:''}`}))}/>{task.device&&<span className="text-xs text-indigo-400">实际设备：{task.device}</span>}</div>
     {task.state==='running'&&<div className="mt-3"><MediaProgress value={task.percent} label={task.name+'处理进度'}/></div>}
     {task.fallbackReason&&<p className="mt-2 break-words text-xs text-amber-500">{task.fallbackReason}</p>}
     {task.error&&<p role="alert" className="mt-2 break-words text-xs text-red-400">{task.error}</p>}
     {task.outputPath&&task.state==='completed'&&<p title={task.outputPath} className="mt-2 truncate text-xs muted">输出：{task.outputPath}</p>}
     <div className="mt-2 flex flex-wrap gap-2">{['queued','running','ready'].includes(task.state)&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onCancel(task.id)}><Square size={13}/>取消</Button>}{['failed','cancelled','interrupted'].includes(task.state)&&<Button size="sm" disabled={busy} onClick={()=>onRetry(task.id)}><RefreshCw size={13}/>重试</Button>}{task.state==='completed'&&<><Button size="sm" variant="ghost" disabled={busy} onClick={()=>onOpen(task.id)}><FolderOpen size={14}/>打开目录</Button>{task.kind==='subtitle'&&<Button size="sm" disabled={busy} onClick={()=>onPreview(task.id)}><Subtitles size={14}/>预览 / 导出 SRT</Button>}</>}</div>
    </div>
   </article>)}</div>
  </>}
 </section>
}
