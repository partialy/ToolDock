import {useEffect,useMemo,useState} from 'react'
import {CheckSquare,Copy,Download,FolderOpen,Scissors,Search,Trash2,Undo2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {SelectField} from '@/components/ui/select-field'
import {useDialog} from '@/components/ui/dialog-provider'
import {msg} from '@/components/ui/message'
import type {MediaPreferences,MediaTask} from '@/shared/mediaModels'
import {subtractInterval,type AudioProject,type AudioStatus,type AudioExportJob} from '@/shared/audioEditingModels'
import {formatAudioTime,parseAudioTime} from '@/lib/audio-editing/time'
import {AudioExportDialog} from './AudioExportDialog'

const labels:Record<AudioExportJob['state'],string>={queued:'排队中',running:'导出中',completed:'已完成',failed:'失败',cancelled:'已取消',interrupted:'已中断'}
export function AudioProjectsPanel({status,prefs,legacy,focusJobId,onEdit,onRefresh}:{status:AudioStatus;prefs:MediaPreferences;legacy:MediaTask[];focusJobId?:string;onEdit:(id:string)=>void;onRefresh:()=>void}){
 const {confirm}=useDialog()
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState<string[]>([])
 const [exportTargets,setExportTargets]=useState<AudioProject[]>([]),[exportOpen,setExportOpen]=useState(false)
 const [batchSeconds,setBatchSeconds]=useState('5'),[batchSide,setBatchSide]=useState<'start'|'end'>('start')
 const [lastBatch,setLastBatch]=useState<{id:string;revision:number;edit:AudioProject['edit'];outputName:string}[]>([])
 const [expanded,setExpanded]=useState<string[]>([]),[cacheMB,setCacheMB]=useState(Math.round(status.preferences.cacheLimitBytes/1024**2))
 useEffect(()=>{if(!focusJobId)return;const job=status.jobs.find(j=>j.id===focusJobId);if(!job)return;setExpanded(ids=>ids.includes(job.projectId)?ids:[...ids,job.projectId]);const timer=setTimeout(()=>document.querySelector('[data-dashboard-task-id="'+CSS.escape(focusJobId)+'"]')?.scrollIntoView({block:'center',behavior:'smooth'}),200);return()=>clearTimeout(timer)},[focusJobId])
 const projects=useMemo(()=>status.projects.filter(p=>p.displayName.toLowerCase().includes(query.toLowerCase())||p.source.path.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.lastOpenedAt-a.lastOpenedAt),[status.projects,query])
 const pageSize=25,totalPages=Math.max(1,Math.ceil(projects.length/pageSize)),visible=projects.slice(Math.min(page,totalPages-1)*pageSize,(Math.min(page,totalPages-1)+1)*pageSize)
 const selectAll=visible.length>0&&visible.every(p=>selected.includes(p.id))
 const chooseExport=(ids:string[])=>{const targets=status.projects.filter(p=>ids.includes(p.id));if(!targets.length){msg.warning('请先选择音频工程');return}setExportTargets(targets);setExportOpen(true)}
 const remove=async(ids:string[])=>{
  if(!ids.length)return
  if(!await confirm({title:'移除音频工程？',description:'仅删除选中的工程、编辑记录与导出历史。原始媒体和已经导出的音频文件不会删除。',variant:'danger',confirmText:'移除工程'}))return
  try{await window.toolDock.audio.remove(ids);setSelected(x=>x.filter(id=>!ids.includes(id)));onRefresh();msg.success('工程已移除')}
  catch(e){msg.error(e)}
 }
 const clearHistory=async(ids:string[],deleteFiles:boolean)=>{
  if(!ids.length)return
  if(!await confirm({title:deleteFiles?'删除已导出音频及记录？':'清理导出记录？',
   description:deleteFiles?'将删除选定的已导出文件及记录，原始媒体不会删除。只允许删除身份未发生变化的输出文件。':'仅删除导出历史，原始媒体、编辑工程和已导出的文件均会保留。',
   variant:deleteFiles?'danger':'warning',confirmText:deleteFiles?'删除文件及记录':'清除记录'}))return
  try{await window.toolDock.audio.removeHistory(ids,deleteFiles);onRefresh();msg.success('已清理导出历史')}
  catch(e){msg.error(e)}
 }
 const batch=async()=>{
  const n=parseAudioTime(batchSeconds),target=status.projects.filter(p=>selected.includes(p.id))
  if(!n||!target.length){msg.warning('选择至少一项工程并输入有效的时间');return}
  const preview=target.map(p=>({p,stream:p.source.streams.find(s=>s.index===p.streamIndex)!})),valid=preview.filter(x=>n<x.stream.durationUs)
  if(!valid.length){msg.warning('选中音轨均短于裁剪秒数');return}
  if(!await confirm({title:'统一裁切选中的音频？',description:'在 '+valid.length+' 个工程中追加删除'+(batchSide==='start'?'开头':'结尾')+' '+batchSeconds+' 秒；超时长文件跳过，原有剪辑区间保持。',confirmText:'应用裁切'}))return
  const backup:typeof lastBatch=[];let ok=0,failed=0
  for(const {p,stream} of valid){
   try{
    const range=batchSide==='start'?{startUs:0,endUs:n}:{startUs:stream.durationUs-n,endUs:stream.durationUs}
    const edit={...p.edit,kept:subtractInterval(p.edit.kept,range,stream.durationUs)}
    const result=await window.toolDock.audio.save(p.id,p.revision,edit,p.outputName)
    backup.push({id:p.id,revision:result.revision,edit:p.edit,outputName:p.outputName});ok++
   }catch{failed++}
  }
  setLastBatch(backup);onRefresh();msg[failed?'warning':'success']('批量裁切完成 '+ok+' 项'+(failed?'，失败 '+failed+' 项':''))
 }
 const undoBatch=async()=>{
  let restored=0
  for(const row of lastBatch)try{await window.toolDock.audio.save(row.id,row.revision,row.edit,row.outputName);restored++}catch{}
  setLastBatch([]);onRefresh();msg.info('已撤销 '+restored+' 项上次批量裁切')
 }
 const retry=async(jobId:string)=>{try{await window.toolDock.audio.retry(jobId);onRefresh()}catch(e){msg.error(e)}}
 const cancel=async(jobId:string)=>{try{await window.toolDock.audio.cancel(jobId);onRefresh()}catch(e){msg.error(e)}}
 const copy=async(id:string)=>{try{await window.toolDock.audio.copy(id);onRefresh();msg.success('已复制工程')}catch(e){msg.error(e)}}
 const fromOld=async(task:MediaTask)=>{
  const file=task.inputPath||task.outputPath
  try{
   const result=await window.toolDock.audio.addSources([file])
   if(!result.added&&!result.reused&&task.outputPath)await window.toolDock.audio.addSources([task.outputPath])
   onRefresh();msg.success('已导入音频工程')
  }catch(e){msg.error(e)}
 }
 return <section className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><h2 className="text-sm font-semibold">音频工程</h2><p className="mt-1 text-xs muted">导入后不立即写文件 · 可以剪辑或直接导出 · 编辑记录自动保存</p></div>
   <div className="flex flex-wrap gap-2"><Button size="sm" onClick={()=>chooseExport(selected)} disabled={!selected.length}><Download size={14}/>导出选中 ({selected.length})</Button><Button size="sm" variant="danger" disabled={!selected.length} onClick={()=>void remove(selected)}><Trash2 size={14}/>移除选中</Button><Button size="sm" disabled={!status.jobs.some(j=>!['queued','running'].includes(j.state))} onClick={()=>void clearHistory(status.jobs.filter(j=>!['queued','running'].includes(j.state)).map(j=>j.id),false)}>清理导出历史</Button></div>
  </div>
  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
   <Search size={16} className="muted"/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}} placeholder="搜索工程名称或文件路径" className="h-9 min-w-28 flex-1 bg-transparent text-sm outline-none"/>
   <span className="text-xs muted">{projects.length} 项</span>
   <Button size="sm" onClick={()=>setSelected(selectAll?selected.filter(id=>!visible.some(p=>p.id===id)):[...new Set([...selected,...visible.map(p=>p.id)])])}>{selectAll?'取消全选':'全选当前页'}</Button>
  </div>
  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
   <span className="text-xs muted">批量删除</span>
   <SelectField ariaLabel="批量裁切位置" value={batchSide} onValueChange={v=>setBatchSide(v as 'start'|'end')} options={[{value:'start',label:'前 N 秒'},{value:'end',label:'后 N 秒'}]} className="h-9"/>
   <input aria-label="批量剪辑秒数" value={batchSeconds} onChange={e=>setBatchSeconds(e.target.value)} className="h-9 w-24 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-2 text-sm"/>
   <Button size="sm" disabled={!selected.length} onClick={()=>void batch()}><Scissors size={14}/>应用至选中</Button>
   {lastBatch.length>0&&<Button size="sm" onClick={()=>void undoBatch()}><Undo2 size={14}/>撤销上次批量裁切</Button>}
  </div>
  {visible.length===0?<div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm muted">还没有音频工程，拖入视频或音频开始使用</div>:
   <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
    {visible.map(p=>{
     const stream=p.source.streams.find(s=>s.index===p.streamIndex)!,jobs=status.jobs.filter(j=>j.projectId===p.id),active=jobs.some(j=>j.state==='queued'||j.state==='running')
     return <div key={p.id} className="space-y-2 p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
       <input type="checkbox" checked={selected.includes(p.id)} aria-label={'选择'+p.displayName} onChange={e=>setSelected(s=>e.target.checked?[...s,p.id]:s.filter(id=>id!==p.id))} className="accent-indigo-500"/>
       <div className="min-w-32 flex-1"><p title={p.source.path} className="break-all text-sm font-semibold">{p.displayName}</p><p className="truncate text-xs muted">{p.source.path}</p></div>
       <span className="text-xs muted">{formatAudioTime(stream.durationUs)} · {stream.codec} · {p.edit.kept.length}段保留</span>
       <Button size="sm" variant="primary" onClick={()=>onEdit(p.id)}><Scissors size={14}/>编辑</Button>
       <Button size="sm" onClick={()=>chooseExport([p.id])}><Download size={14}/>导出</Button>
       <Button size="sm" onClick={()=>void copy(p.id)}><Copy size={14}/>复制</Button>
       <Button size="sm" variant="danger" disabled={active} onClick={()=>void remove([p.id])}><Trash2 size={14}/></Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-6">
       <span className="text-xs muted">音轨：</span>
       <SelectField ariaLabel={'切换'+p.displayName+'音轨'} value={String(p.streamIndex)} onValueChange={v=>void window.toolDock.audio.addTrack(p.id,Number(v)).then(onRefresh).catch(e=>msg.error(e))}
        options={p.source.streams.map(s=>({value:String(s.index),label:'音轨 '+s.index+' · '+s.codec+(s.language?' · '+s.language:'')}))} className="h-8 min-w-36"/>
       <Button size="sm" variant="ghost" onClick={()=>void window.toolDock.audio.relink(p.id).then(result=>{if(result)onRefresh()}).catch(e=>msg.error(e))}>重新关联源文件</Button>
       <Button size="sm" variant="ghost" onClick={()=>setExpanded(s=>s.includes(p.id)?s.filter(id=>id!==p.id):[...s,p.id])}>导出历史 ({jobs.length})</Button>
      </div>
      {expanded.includes(p.id)&&<div className="space-y-2 rounded-xl bg-[var(--panel-alt)] p-3">
       {jobs.length===0?<p className="text-xs muted">暂无导出记录</p>:jobs.map(j=><div key={j.id} data-dashboard-task-id={j.id} className="flex flex-wrap items-center gap-2 text-xs">
        <span className="min-w-24">{labels[j.state]} {j.state==='running'?Math.round(j.percent)+'%':''}</span>
        <span className="min-w-0 flex-1 truncate" title={j.outputPath||j.error}>{j.outputPath||j.error||j.options.format.toUpperCase()+' · 等待处理'}</span>
        {j.state==='completed'&&<Button size="sm" onClick={()=>void window.toolDock.audio.open(j.id).catch(e=>msg.error(e))}><FolderOpen size={14}/>打开</Button>}
        {['failed','cancelled','interrupted'].includes(j.state)&&<Button size="sm" onClick={()=>void retry(j.id)}>重试</Button>}
        {['queued','running'].includes(j.state)&&<Button size="sm" onClick={()=>void cancel(j.id)}>取消</Button>}
        {!['queued','running'].includes(j.state)&&<Button size="sm" variant="ghost" onClick={()=>void clearHistory([j.id],false)}>清除记录</Button>}
        {j.state==='completed'&&j.outputSignature&&<Button size="sm" variant="danger" onClick={()=>void clearHistory([j.id],true)}>删除输出文件</Button>}
       </div>)}
      </div>}
     </div>
    })}
   </div>}
  <div className="flex items-center justify-between gap-2"><span className="text-xs muted">第 {Math.min(page,totalPages-1)+1}/{totalPages} 页</span><div className="flex gap-2"><Button size="sm" disabled={page<=0} onClick={()=>setPage(p=>Math.max(0,p-1))}>上一页</Button><Button size="sm" disabled={page>=totalPages-1} onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))}>下一页</Button></div></div>
  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
   <span className="text-xs muted">预览缓存上限 (MB)</span><input type="number" min={128} max={20480} value={cacheMB} onChange={e=>setCacheMB(Number(e.target.value))} className="h-9 w-28 rounded-lg bg-[var(--panel-alt)] px-2 text-sm"/>
   <Button size="sm" onClick={()=>void window.toolDock.audio.setPreferences({cacheLimitBytes:cacheMB*1024**2}).then(()=>{onRefresh();msg.success('缓存设置已保存')}).catch(e=>msg.error(e))}>保存设置</Button>
  </div>
  {legacy.length>0&&<details className="rounded-xl border border-[var(--border)] p-3"><summary className="cursor-pointer text-xs muted">历史版本提取任务（{legacy.length} 项）</summary>
   <div className="mt-3 space-y-2">{legacy.map(t=><div key={t.id} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{t.name} · {t.state}</span><Button size="sm" onClick={()=>void fromOld(t)}>转为音频工程</Button>{t.state==='completed'&&<Button size="sm" onClick={()=>void window.toolDock.media.openOutput(t.id).catch(e=>msg.error(e))}>打开旧输出</Button>}</div>)}</div>
  </details>}
  <AudioExportDialog open={exportOpen} onOpenChange={setExportOpen} projects={exportTargets} prefs={prefs} directory={status.preferences.outputDirectory} onDone={onRefresh}/>
 </section>
}
