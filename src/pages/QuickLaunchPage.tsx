import {useEffect,useMemo,useState} from 'react'
import {ChevronDown,Library,Plus,RefreshCw,Search,Zap} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {SelectField} from '@/components/ui/select-field'
import {useDialog} from '@/components/ui/dialog-provider'
import {useQuickLaunch} from '@/hooks/useQuickLaunch'
import {QuickLaunchGrid} from '@/components/quick-launch/QuickLaunchGrid'
import {QuickLaunchEditorDialog} from '@/components/quick-launch/QuickLaunchEditorDialog'
import {QuickLaunchLibraryDialog} from '@/components/quick-launch/QuickLaunchLibraryDialog'
import {QuickLaunchGroupDialog} from '@/components/quick-launch/QuickLaunchGroupDialog'
import {QuickLaunchRunDrawer} from '@/components/quick-launch/QuickLaunchRunDrawer'
import type {CardAction} from '@/components/quick-launch/QuickLaunchCard'
import {isQuickLaunchLocked,type QuickLaunchApp,type QuickLaunchSave,type QuickLaunchTask} from '@/shared/quickLaunchModels'

export function QuickLaunchPage({trigger}:{trigger:'single'|'double'}){
 const q=useQuickLaunch(),dialog=useDialog()
 const [search,setSearch]=useState(''),[group,setGroup]=useState('all'),[shell,setShell]=useState('all'),[status,setStatus]=useState('all'),[folded,setFolded]=useState<string[]>([])
 const [editor,setEditor]=useState<{app:QuickLaunchApp|null}|null>(null),[library,setLibrary]=useState(false),[groupsOpen,setGroupsOpen]=useState(false),[taskId,setTaskId]=useState<string|null>(null)
 useEffect(()=>{if(!q.loading&&group!=='all'&&!q.groups.some(g=>g.id===group))setGroup('all')},[q.loading,q.groups,group])
 const orphanedTasks=q.tasks.filter(task=>task.status==='unknown'&&!q.apps.some(app=>app.id===task.appId))
 const tasks=useMemo(()=>{const result=new Map<string,QuickLaunchTask>();for(const task of [...q.tasks].sort((a,b)=>a.startedAt.localeCompare(b.startedAt))){const previous=result.get(task.appId);if(!previous||!isQuickLaunchLocked(previous)||isQuickLaunchLocked(task))result.set(task.appId,task)}return result},[q.tasks])
 const lockedIds=new Set([...tasks].filter(([,task])=>isQuickLaunchLocked(task)).map(([id])=>id))
 const query=search.trim().toLowerCase(),sortable=!query&&group==='all'&&shell==='all'&&status==='all'
 const matches=(app:QuickLaunchApp)=>{
  const task=tasks.get(app.id),running=!!task&&['starting','running'].includes(task.status),abnormal=!!task&&['failed','unknown'].includes(task.status)
  return app.visible&&(!query||(app.name+' '+app.description).toLowerCase().includes(query))&&(shell==='all'||app.shell===shell)&&(status==='all'||status==='running'&&running||status==='idle'&&!running&&!abnormal||status==='abnormal'&&abnormal)
 }
 const visibleGroups=q.groups.filter(g=>group==='all'||group===g.id)
 const orderedApps=[...q.apps].sort((a,b)=>a.sortOrder-b.sortOrder)
 const run=async(app:QuickLaunchApp)=>{
  const current=tasks.get(app.id);if(current&&isQuickLaunchLocked(current)){setTaskId(current.id);return}
  await q.action(app.id,async()=>{if(app.confirmBeforeRun&&!await dialog.confirm({title:app.confirmTitle||'提示',description:app.confirmMessage||`确认运行${app.name}吗？`,confirmText:app.confirmAccept||'确认',cancelText:app.confirmCancel||'取消',variant:app.runAsAdmin?'warning':'confirm'}))return;const task=await q.api.run(app.id,app.revision,true);setTaskId(task.id)})
 }
 const remove=async(app:QuickLaunchApp)=>{await q.action(app.id,async()=>{if(await dialog.confirm({title:'删除 App？',description:`删除“${app.name}”的配置和 ToolDock 托管资源，此操作无法撤销。外部原始脚本和工作目录不会删除。`,variant:'danger',confirmText:'永久删除'}))await q.api.remove(app.id,app.revision)})}
 const visible=(app:QuickLaunchApp)=>q.action(app.id,()=>q.api.setVisible(app.id,app.revision,!app.visible))
 const move=(app:QuickLaunchApp,delta:number)=>{
  const all=orderedApps.filter(a=>a.groupId===app.groupId),shown=all.filter(matches),index=shown.findIndex(a=>a.id===app.id),other=shown[index+delta]
  if(!other||lockedIds.has(app.id)||lockedIds.has(other.id))return
  const from=all.findIndex(a=>a.id===app.id),to=all.findIndex(a=>a.id===other.id)
  // 交换当前筛选结果的槽位，隐藏、未匹配项及运行锁定项保持原位。
  ;[all[from],all[to]]=[all[to],all[from]]
  void q.action('order:'+app.groupId,()=>q.api.reorderApps(app.groupId,all.map(a=>a.id)))
 }
 const onCardAction=(app:QuickLaunchApp,action:CardAction)=>{
  const task=tasks.get(app.id)
  if(action==='run'){void run(app);return}
  if(action==='details'){if(task)setTaskId(task.id);return}
  if(action==='copy'){void q.action(app.id,()=>navigator.clipboard.writeText(app.sourceKind==='inline'?app.inlineContent:app.scriptName||app.managedScript||''));return}
  if(action==='stop'){if(task)void q.action(app.id,async()=>{if(await dialog.confirm({title:'停止任务？',description:`停止“${app.name}”及身份已核验的受控进程组？`,variant:'danger',confirmText:'停止任务'}))await q.api.stop(task.id)});return}
  if(lockedIds.has(app.id))return
  if(action==='edit')setEditor({app})
  if(action==='hide')void visible(app)
  if(action==='forward')move(app,-1)
  if(action==='back')move(app,1)
 }
 const save=async(value:QuickLaunchSave)=>!!await q.action(value.id||'create',()=>q.api.save(value))
 return <div className="mx-auto flex min-h-full max-w-[1500px] flex-col gap-6 p-6">
  <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-xl font-semibold"><Zap size={23} className="text-[var(--primary)]"/> 快捷启动</h1><p className="mt-2 text-xs muted">{trigger==='single'?'单击启动 App':'单击选择，双击或 Enter 启动 App'} · 运行中和状态未知的 App 将锁定配置</p></div><div className="flex gap-2"><Button onClick={()=>setLibrary(true)}><Library size={16}/> App 库</Button><Button variant="primary" onClick={()=>setEditor({app:null})}><Plus size={16}/> 新增</Button></div></header>
  <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-44 flex-1"><Search size={15} className="absolute left-3 top-3 text-[var(--muted)]"/><Input aria-label="搜索快捷启动" className="h-10 pl-9" placeholder="搜索名称或描述" value={search} onChange={e=>setSearch(e.target.value)}/></div><SelectField ariaLabel="筛选分组" value={group} onValueChange={setGroup} options={[{value:'all',label:'全部分组'},...q.groups.map(g=>({value:g.id,label:g.name}))]}/><SelectField ariaLabel="筛选执行类型" value={shell} onValueChange={setShell} options={[{value:'all',label:'全部类型'},{value:'powershell',label:'PowerShell'},{value:'cmd',label:'CMD'}]}/><SelectField ariaLabel="筛选运行状态" value={status} onValueChange={setStatus} options={[{value:'all',label:'全部状态'},{value:'running',label:'运行中'},{value:'idle',label:'未运行'},{value:'abnormal',label:'异常'}]}/><Button size="icon" title="刷新任务状态" aria-label="刷新任务状态" disabled={q.pending.includes('refresh')} onClick={()=>void q.action('refresh',()=>q.api.reconcile())}><RefreshCw size={16}/></Button></div>
  {q.error&&<div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">{q.error}<Button size="sm" onClick={()=>q.setError('')}>关闭</Button></div>}
  {orphanedTasks.length>0&&<section role="alert" className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><div><h2 className="text-sm font-semibold text-amber-500">检测到无法关联 App 的未知任务</h2><p className="mt-1 text-xs leading-5 muted">运行记录可能损坏或原 App 已不存在。为避免重复运行，快捷启动暂时受到保护；请查看详情，重新检测或确认解除未知状态锁。</p></div>{orphanedTasks.map(task=><div key={task.id} className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-all text-xs">{task.appName||'未知任务'} · {task.id}</span><Button size="sm" onClick={()=>setTaskId(task.id)}>查看详情 / 解除未知状态</Button></div>)}</section>}
  {q.loading?<p className="py-12 text-center text-sm muted">正在读取快捷启动…</p>:<div className="space-y-6">{visibleGroups.map(g=>{const all=orderedApps.filter(a=>a.groupId===g.id),apps=all.filter(matches),collapsed=folded.includes(g.id)&&!query;if(!apps.length&&(query||shell!=='all'||status!=='all'))return null;return <section key={g.id}><button className="mb-3 flex w-full items-center gap-2 rounded-lg py-1 text-left" onClick={()=>setFolded(old=>old.includes(g.id)?old.filter(id=>id!==g.id):[...old,g.id])} aria-expanded={!collapsed}><ChevronDown size={16} className={collapsed?'-rotate-90':''}/><h2 className="text-sm font-semibold">{g.name}</h2><span className="text-xs muted">{apps.length}</span></button>{!collapsed&&(apps.length?<QuickLaunchGrid apps={apps} allApps={all} tasks={tasks} sortable={sortable} trigger={trigger} pending={q.pending} onAction={onCardAction} onReorder={ids=>void q.action('order:'+g.id,()=>q.api.reorderApps(g.id,ids))}/>:<div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center text-xs muted">暂无 App，可新增或从 App 库恢复隐藏项目。</div>)}</section>})}{!orderedApps.some(a=>(group==='all'||a.groupId===group)&&matches(a))&&(query||shell!=='all'||status!=='all')&&<p className="py-12 text-center text-sm muted">没有匹配的 App，试试调整筛选条件。</p>}</div>}
  {library&&<QuickLaunchLibraryDialog error={q.error} apps={orderedApps} groups={q.groups} lockedIds={lockedIds} busy={q.pending.length>0} onClose={()=>setLibrary(false)} onEdit={app=>{setLibrary(false);setEditor({app})}} onVisible={app=>void visible(app)} onDelete={app=>void remove(app)} onGroups={()=>setGroupsOpen(true)}/>}
  {groupsOpen&&<QuickLaunchGroupDialog error={q.error} groups={q.groups} apps={q.apps} lockedIds={lockedIds} onClose={()=>setGroupsOpen(false)} onAction={q.action}/>}
  {editor&&<QuickLaunchEditorDialog key={editor.app?.id||'create'} app={editor.app} groups={q.groups} environment={q.environment} locked={!!editor.app&&lockedIds.has(editor.app.id)} onClose={()=>setEditor(null)} onSave={save}/>}
  {taskId&&<QuickLaunchRunDrawer key={taskId} taskId={taskId} onClose={()=>setTaskId(null)} onRefresh={q.refresh}/>}
 </div>
}
