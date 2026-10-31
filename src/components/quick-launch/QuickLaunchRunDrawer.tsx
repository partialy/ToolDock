import {useEffect,useState} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {motion} from 'motion/react'
import {RefreshCw,Square,X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {useMicroMotion} from '@/components/ui/motion-preference'
import {useDialog} from '@/components/ui/dialog-provider'
import type {QuickLaunchTask} from '@/shared/quickLaunchModels'
import {statusLabels} from './QuickLaunchCard'
import {QuickLaunchConsole} from './QuickLaunchConsole'
export function QuickLaunchRunDrawer({taskId,onClose,onRefresh}:{taskId:string;onClose:()=>void;onRefresh:()=>Promise<void>}){
 const [task,setTask]=useState<QuickLaunchTask|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now())
 const {off,reduced}=useMicroMotion(),dialog=useDialog(),api=window.toolDock.quickLaunch
 useEffect(()=>{
  let live=true,reading=false
  const read=async()=>{if(reading)return;reading=true;try{const value=await api.task(taskId);if(live){setTask(value);setNow(Date.now())}}catch(e){if(live)setError(e instanceof Error?e.message:String(e))}finally{reading=false}}
  void read();const timer=setInterval(()=>void read(),750)
  return()=>{live=false;clearInterval(timer)}
 },[taskId,api])
 const action=async(kind:'stop'|'reconcile'|'clear')=>{
  if(busy)return;setBusy(true);setError('')
  try{if(kind==='stop'){if(!await dialog.confirm({title:'停止任务？',description:'将停止该任务及身份已核验的受控进程组。未归属此任务的进程不会结束。',variant:'danger',confirmText:'停止任务'}))return;await api.stop(taskId)}else if(kind==='clear'){if(!await dialog.confirm({title:'解除未知状态？',description:'任务身份无法核实。解除后仅移除锁，不会终止无法识别的进程；再次运行可能产生重复实例。',variant:'danger',confirmText:'确认解除锁'}))return;await api.clearUnknown(taskId,true)}else await api.reconcile();setTask(await api.task(taskId));await onRefresh()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 const duration=task?Math.max(0,Math.floor(((task.endedAt?Date.parse(task.endedAt):now)-Date.parse(task.startedAt))/1000)):0
 return <Dialog.Root open onOpenChange={v=>{if(!v)onClose()}}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[270] bg-black/40"/><Dialog.Content asChild><motion.aside initial={off?false:{opacity:0,x:reduced?0:30}} animate={{opacity:1,x:0}} transition={{duration:off?0:reduced?.08:.18}} className="fixed bottom-0 right-0 top-0 z-[271] flex w-[min(720px,100vw)] flex-col border-l border-[var(--border)] bg-[var(--panel)] shadow-2xl outline-none">
  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] p-5"><div><Dialog.Title className="font-semibold">{task?.appName||'运行详情'}</Dialog.Title><Dialog.Description className="mt-1 text-xs muted">仅保留内存中的输出，关闭 ToolDock 后不恢复历史日志。</Dialog.Description></div><Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="关闭运行详情"><X size={18}/></Button></Dialog.Close></div>
  <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
   {!task?<p className="text-sm muted">正在读取任务…</p>:<><div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 text-xs"><div>状态 <strong className="ml-2">{statusLabels[task.status]}</strong></div><div>时长 <span className="ml-2">{duration} 秒</span></div><div className="col-span-2 break-all"><span className="muted">任务 ID </span>{task.id}</div><div className="col-span-2"><span className="muted">开始时间 </span>{new Date(task.startedAt).toLocaleString()}</div><div><span className="muted">主 PID </span>{task.pid??'—'}</div><div><span className="muted">Runner PID </span>{task.runnerPid??'—'}</div><div className="col-span-2 break-all"><span className="muted">已核验子进程 </span>{task.childPids.length?task.childPids.join(', '):'无'}</div><div><span className="muted">退出码 </span>{task.exitCode??'—'}</div><div><span className="muted">执行模式 </span>{task.silent?'静默':'原生终端'}{task.runAsAdmin?' / 管理员':''}</div>{task.reason&&<div className="col-span-2 break-words"><span className="muted">结束原因 </span>{task.reason}</div>}</div>
    {task.connectionNote&&<p className="shrink-0 text-xs text-amber-500">{task.connectionNote}</p>}
    <div className="shrink-0 rounded-xl bg-[var(--panel-alt)] p-3"><p className="mb-1 text-xs muted">命令摘要</p><pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">{task.commandSummary}</pre></div>
    <div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>void action('reconcile')}><RefreshCw size={14}/> 重新检测</Button>{['starting','running'].includes(task.status)&&<Button size="sm" variant="danger" disabled={busy} onClick={()=>void action('stop')}><Square size={13}/> 停止任务</Button>}{task.status==='unknown'&&<Button size="sm" variant="danger" disabled={busy} onClick={()=>void action('clear')}>解除未知状态锁</Button>}</div>
    {!task.silent&&<p className="shrink-0 text-xs muted">此任务使用原生终端，完整输出请在终端中查看。</p>}
    <QuickLaunchConsole key={task.id} output={task.output} outputSequence={task.outputSequence} truncated={task.truncated} onError={setError}/>
   </>}{error&&<p role="alert" className="shrink-0 text-xs text-red-400">{error}</p>}
  </div>
 </motion.aside></Dialog.Content></Dialog.Portal></Dialog.Root>
}
