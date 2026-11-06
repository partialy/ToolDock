import {useMemo,useState} from 'react'
import {Activity,AlertCircle,ArrowUpRight,Blocks,CheckCircle2,Clock3,Download,Plus,RefreshCw,Search,Server,Wifi,Zap,Music2,Languages} from 'lucide-react'
import {Icon} from '@/components/ui/icon'
import {Input} from '@/components/ui/input'
import {Button} from '@/components/ui/button'
import {useDashboard} from '@/hooks/useDashboard'
import type {DashboardTask,DashboardGroup} from '@/shared/dashboardModels'
import type {Workspace} from '@/store/useWorkspace'

const label:Record<DashboardGroup,string>={running:'运行中',queued:'排队中',completed:'已完成',failed:'失败',ready:'待开始',pending:'待审批',paused:'已暂停',unknown:'状态未知',cancelled:'已取消'}
const sourceName:Record<DashboardTask['source'],string>={
 'quick-launch':'快捷启动','media-extract':'音频提取','media-subtitle':'字幕识别',
 'text-conversion':'简繁转换','transfer-upload':'文件上传','transfer-download':'文件下载','model-download':'模型下载'
}
const sourceIcon:Record<DashboardTask['source'],typeof Activity>={
 'quick-launch':Zap,'media-extract':Music2,'media-subtitle':Music2,
 'text-conversion':Languages,'transfer-upload':Wifi,'transfer-download':Wifi,'model-download':Download
}
const statusColor:Partial<Record<DashboardGroup,string>>={running:'text-indigo-400',completed:'text-emerald-500',failed:'text-rose-400',unknown:'text-amber-400'}
type ListTab='active'|'completed'|'abnormal'
function Dashboard({onTask}:{onTask:(task:DashboardTask)=>void}){
 const {snapshot,loading,error,refresh}=useDashboard()
 const [tab,setTab]=useState<ListTab>('active')
 const partial=Boolean(snapshot?.health.some(s=>!s.available))
 const visible=useMemo(()=>{
  const rows=snapshot?.tasks.filter(t=>tab==='active'?['running','queued','paused'].includes(t.state):tab==='completed'?t.state==='completed':['failed','unknown'].includes(t.state))||[]
  return [...rows].sort((a,b)=>{
   if(tab==='active'){
    const rank=(t:DashboardTask)=>t.state==='running'?0:t.state==='queued'?1:2
    if(rank(a)!==rank(b))return rank(a)-rank(b)
   }
   return (b.timestamp??0)-(a.timestamp??0)
  }).slice(0,6)
 },[snapshot,tab])
 const stats=[{key:'running' as const,title:'运行中',icon:Activity},{key:'queued' as const,title:'排队中',icon:Clock3},{key:'completed' as const,title:'已完成',icon:CheckCircle2},{key:'failed' as const,title:'失败',icon:AlertCircle}]
 const groupTab=[{id:'active',title:'进行中'},{id:'completed',title:'最近完成'},{id:'abnormal',title:'异常任务'}] as const
 return <section className="space-y-4" aria-label="后台任务仪表盘">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className="text-base font-semibold">运行概览</h2><p className="mt-1 text-xs muted">后台任务实时状态 · 已完成和失败数量以当前可查询记录为准，不代表累计总量</p></div>
   <Button size="sm" variant="ghost" disabled={loading} onClick={()=>void refresh()}><RefreshCw size={15}/>刷新状态</Button>
  </div>
  <div className="grid gap-3 @min-[520px]:grid-cols-2 @min-[960px]:grid-cols-4">
   {stats.map(({key,title,icon:StatIcon})=><div key={key} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
    <div className="flex items-center justify-between gap-2 text-xs muted"><span>{title}</span><StatIcon size={17}/></div>
    <div className="mt-3 flex items-baseline gap-2"><span className="text-3xl font-semibold tabular-nums">{snapshot?snapshot.counts[key]:'—'}</span>{partial&&<span className="text-[10px] text-amber-500">部分来源</span>}</div>
   </div>)}
  </div>
  {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-500">仪表盘暂不可用：{error}<Button size="sm" onClick={()=>void refresh()}>重试</Button></div>}
  {partial&&<p role="status" className="flex items-center gap-2 text-xs text-amber-500"><AlertCircle size={15}/>部分模块状态暂不可用；数字仅包含成功读取的来源。可点击刷新重试。</p>}
  <div className="grid min-w-0 gap-4 @min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(245px,.85fr)]">
   <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
     <h3 className="text-sm font-semibold">后台任务</h3>
     <div className="flex gap-1 rounded-lg bg-[var(--panel-alt)] p-1" role="tablist" aria-label="后台任务状态筛选">
      {groupTab.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} className={'rounded-md px-2.5 py-1.5 text-xs '+(tab===t.id?'bg-[var(--panel)] font-semibold shadow':'muted hover:bg-[var(--hover)]')} onClick={()=>setTab(t.id)}>{t.title}</button>)}
     </div>
    </div>
    {loading&&!snapshot?<div className="px-5 py-12 text-center text-sm muted">正在读取任务状态…</div>:visible.length?<div className="divide-y divide-[var(--border)]">
     {visible.map(task=>{
      const TaskIcon=sourceIcon[task.source]
      return <button key={task.key} className="flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left hover:bg-[var(--hover)]" onClick={()=>onTask(task)} title={'打开'+sourceName[task.source]}>
       <div className="mt-0.5 shrink-0 rounded-lg bg-[var(--panel-alt)] p-2 text-indigo-400"><TaskIcon size={17}/></div>
       <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{task.name}</span><span className={'shrink-0 text-xs '+(statusColor[task.state]||'muted')}>{label[task.state]}</span></div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] muted"><span>{sourceName[task.source]}</span>{task.timestamp!=null&&<span>{new Date(task.timestamp).toLocaleString()}</span>}{task.state==='running'&&task.progress!=null&&<span>{task.progress}%</span>}</div>
        {task.state==='running'&&task.progress!==null&&<div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={task.progress} aria-label={task.name+'进度'} className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-alt)]"><div className="h-full rounded-full bg-indigo-500" style={{width:task.progress+'%'}}/></div>}
        {task.reason&&['failed','unknown'].includes(task.state)&&<p className="line-clamp-2 text-xs text-rose-400">{task.reason}</p>}
       </div><ArrowUpRight size={16} className="mt-1 shrink-0 muted"/>
      </button>
     })}
    </div>:<p className="px-5 py-12 text-center text-sm muted">{tab==='active'?'当前没有执行中或排队中的任务':tab==='completed'?'暂无可查询的已完成记录':'暂无失败或未知状态任务'}</p>}
    <div className="border-t border-[var(--border)] px-4 py-2 text-[11px] muted">每类最多显示 6 项 · 点击打开所属工具 · 任务历史保留范围因模块而异</div>
   </div>
   <div className="min-w-0 space-y-3">
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
     <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Server size={16}/>文件快传</h3>
     <p className="text-xs muted">服务状态 <span className={'ml-2 font-medium '+(snapshot?.service.transferRunning?'text-emerald-500':'')}>{snapshot?.service.transferRunning==null?'暂不可用':snapshot.service.transferRunning?'运行中':'未启动'}</span></p>
     <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[var(--panel-alt)] p-3 text-xs">
      <div><p className="muted">连接设备</p><p className="mt-1 text-xl font-semibold tabular-nums">{snapshot?.service.connectedDevices??'—'}</p></div>
      <div><p className="muted">待接收审批</p><p className="mt-1 text-xl font-semibold tabular-nums">{snapshot?.service.pendingApprovals??'—'}</p></div>
     </div>
    </div>
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
     <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Download size={16}/>模型下载</h3>
     <p className="text-xs muted">下载或校验中的任务 <span className="ml-2 text-xl font-semibold tabular-nums">{snapshot?.service.modelDownloads??'—'}</span></p>
     <p className="mt-2 text-[11px] muted">下载任务单独统计，暂停状态不会计入运行中。</p>
    </div>
    {snapshot&&snapshot.counts.unknown>0&&<p className="flex items-center gap-2 rounded-xl border border-amber-500/20 p-3 text-xs text-amber-500"><AlertCircle size={16}/>另有 {snapshot.counts.unknown} 项未知或中断任务，请查看异常任务。</p>}
   </div>
  </div>
 </section>
}
export function HomePage({ws,onGo,onAdd,onTask}:{ws:Workspace;onGo:(v:string)=>void;onAdd:()=>void;onTask:(task:DashboardTask)=>void}){
 const [query,setQuery]=useState('')
 const categories=useMemo(()=>ws.categories.filter(c=>c.visible).sort((a,b)=>a.sortOrder-b.sortOrder),[ws.categories])
 const tools=useMemo(()=>ws.tools.filter(t=>t.visible&&categories.some(c=>c.id===t.categoryId)).filter(t=>!query||t.name.toLowerCase().includes(query.trim().toLowerCase())),[ws.tools,categories,query])
 const featured=tools.filter(t=>t.isBuiltin).slice(0,4)
 const tile=(t:(typeof tools)[number])=><button key={t.id} onClick={()=>onGo('tool:'+t.id)} className="group flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-left transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--hover)]">
  <span className="rounded-lg bg-[var(--panel-alt)] p-2 text-indigo-400"><Icon name={t.icon} size={19}/></span>
  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span><ArrowUpRight size={15} className="shrink-0 muted"/>
 </button>
 return <div className="@container mx-auto max-w-[1350px] space-y-7 p-6">
  <header className="flex flex-wrap items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15"><Blocks size={24} className="text-indigo-400"/></div><div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold">ToolDock 工作台</h1><p className="mt-1 text-xs muted">本地工具与后台任务集中管理</p></div>
   <div className="relative w-full max-w-72"><Search size={16} className="absolute left-3 top-2.5 muted"/><Input aria-label="搜索工具" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索工具..." className="pl-10"/></div>
  </header>
  <Dashboard onTask={onTask}/>
  {!!featured.length&&<section className="space-y-3"><h2 className="text-sm font-semibold">快捷入口</h2><div className="grid gap-3 @min-[650px]:grid-cols-2 @min-[1050px]:grid-cols-4">{featured.map(tile)}</div></section>}
  {categories.map(c=>{const list=tools.filter(t=>t.categoryId===c.id).sort((a,b)=>a.sortOrder-b.sortOrder);return list.length?<section key={c.id} className="space-y-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Icon name={c.icon} size={17}/>{c.name}<span className="text-xs font-normal muted">{list.length}</span></h2><div className="grid gap-3 @min-[650px]:grid-cols-2 @min-[1050px]:grid-cols-3">{list.map(tile)}</div></section>:null})}
  {!tools.length&&<p className="py-16 text-center text-sm muted">没有匹配的工具</p>}
  <button onClick={onAdd} className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] p-3 text-xs muted hover:bg-[var(--hover)]"><Plus size={15}/> 添加网页工具</button>
 </div>
}
