import {useCallback,useEffect,useRef,useState} from 'react'
import {Check,Copy,Download,FolderOpen,Folder,FolderPlus,ChevronDown,ChevronRight,History,HardDrive,Plus,Power,RefreshCw,Settings2,Trash2,Users,Wifi,X,QrCode,Save} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {SelectField} from '@/components/ui/select-field'
import {SwitchField} from '@/components/ui/switch-field'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {useDialog} from '@/components/ui/dialog-provider'
import {msg} from '@/components/ui/message'
import {qrBlob} from '@/lib/qr/render'
import {defaultQrConfig} from '@/lib/qr/config'
import type {TransferSnapshot,TransferPreferences,DirectoryPage,DirectoryStats,AddSourcesResult} from '@/shared/fileTransferModels'
import {useWindowFileDrop,DropOverlay} from '@/hooks/useWindowFileDrop'
import {ShareHistoryDialog} from '@/components/ShareHistoryDialog'
import {TransferPoolTab} from '@/components/transfer/TransferPoolTab'
import {TransferMessagesTab} from '@/components/transfer/TransferMessagesTab'

const CARD='rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4'
const human=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GiB':n>=1024**2?(n/1024**2).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':n+' B'
type Tab='pool'|'shares'|'messages'|'tasks'|'devices'
export function FileTransferPage({focus}:{focus?:import('@/shared/dashboardModels').DashboardFocus|null}){
 const dialog=useDialog()
 const [snapshot,setSnapshot]=useState<TransferSnapshot|null>(null)
 const [selectedIp,setSelectedIp]=useState('')
 const [tab,setTab]=useState<Tab>('pool')
 const [qr,setQr]=useState('')
 const [showQr,setShowQr]=useState(false)
 const [showSettings,setShowSettings]=useState(false)
 const [cap,setCap]=useState('20')
 const [busy,setBusy]=useState(false)
 const [revision,setRevision]=useState(0)
 const [historyOpen,setHistoryOpen]=useState(false)
 const [expanded,setExpanded]=useState<string[]>([])
 const [directories,setDirectories]=useState<Record<string,DirectoryPage>>({})
 const [directoryStats,setDirectoryStats]=useState<Record<string,DirectoryStats>>({})
 const load=useCallback(()=>window.toolDock.transfer.status().then(s=>{setSnapshot(s);setSelectedIp(old=>old||s.address||s.interfaces[0]?.address||'')}),[])
 useEffect(()=>{void load().catch(e=>msg.error(e));return window.toolDock.transfer.onChange(next=>setSnapshot(next))},[load])
 useEffect(()=>{setCap(String((snapshot?.prefs.maxTempBytes||20*1024**3)/1024**3))},[snapshot?.prefs.maxTempBytes])
 useEffect(()=>{
  const listener=()=>setTab('pool')
  window.addEventListener('tooldock:show-incoming',listener)
  return()=>window.removeEventListener('tooldock:show-incoming',listener)
 },[])
 useEffect(()=>{
  let canceled=false,objectUrl=''
  if(!snapshot?.qrUrl){setQr('');return}
  void qrBlob({config:{...defaultQrConfig,kind:'url',url:snapshot.qrUrl,size:320,dotStyle:'square'},revision:0},'png')
   .then(blob=>{objectUrl=URL.createObjectURL(blob);if(!canceled)setQr(objectUrl);else URL.revokeObjectURL(objectUrl)})
   .catch(()=>setQr(''))
  return()=>{canceled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)}
 },[snapshot?.qrUrl])
 const run=async(fn:()=>Promise<unknown>,message:string)=>{
  setBusy(true)
  try{await fn();await load();setRevision(i=>i+1);msg.success(message)}
  catch(e){msg.error(e)}
  finally{setBusy(false)}
 }
 const start=()=>void run(async()=>{if(!selectedIp)throw Error('请选择局域网 IP');await window.toolDock.transfer.start(selectedIp)},'文件快传已启动')
 const stop=async()=>{
  if(!snapshot?.running)return
  const yes=await dialog.confirm({title:'停止文件快传',description:'停止服务会断开所有设备、取消传输并清空文件池和消息池的临时内容。主设备路径分享的原文件、已另存副本不会删除。',variant:'warning',confirmText:'停止并清理'})
  if(yes)await run(()=>window.toolDock.transfer.stop(),'服务已停止，临时共享内容已清理')
 }
 const setPrefs=async(partial:Partial<TransferPreferences>)=>{
  if(!snapshot)return
  const p={...snapshot.prefs,...partial}
  await run(()=>window.toolDock.transfer.setPrefs(p),'快传设置已更新')
 }
 const saveCapacity=()=>{
  const n=Number(cap)
  if(!Number.isInteger(n)||n<1||n>500){msg.warning('文件池配额请输入 1–500 GiB 的整数');return}
  const bytes=n*1024**3
  void setPrefs({maxTempBytes:bytes,maxFileBytes:bytes})
 }
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);msg.success('已复制')}catch(e){msg.error(e)}}
 const drop=async(files:File[])=>{
  const paths=files.map(f=>window.toolDock.transfer.pathForDroppedFile(f)).filter(Boolean)
  if(!paths.length){msg.warning('无法识别拖入文件的本机路径');return}
  await run(async()=>{
   const result=tab==='pool'?await window.toolDock.transfer.pool.add(paths):await window.toolDock.transfer.addSources(paths)
   if(result.errors.length)msg.warning(result.errors.join('\n'))
  },tab==='pool'?'已添加到文件池':'已添加到主设备共享')
 }
 const dropOver=useWindowFileDrop(drop,tab==='pool'||tab==='shares')
 const loadDirectory=async(id:string,cursor?:string)=>{
  try{const page=await window.toolDock.transfer.directory(id,cursor);setDirectories(old=>({...old,[id]:cursor?{...page,items:[...(old[id]?.items||[]),...page.items]}:page}))}
  catch(e){msg.error(e)}
 }
 const toggleFolder=async(id:string)=>{
  if(expanded.includes(id)){setExpanded(old=>old.filter(x=>x!==id));return}
  setExpanded(old=>[...old,id]);await loadDirectory(id)
 }
 const renderDirectory=(id:string):React.ReactNode=>{
  const page=directories[id];if(!page)return <p className="py-2 text-xs muted">正在加载目录...</p>
  return <div className="space-y-1">{page.items.map(entry=><div key={entry.id}>
   <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs">
    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={()=>entry.kind==='directory'?void toggleFolder(entry.id):undefined}>{entry.kind==='directory'?(expanded.includes(entry.id)?<ChevronDown size={13}/>:<ChevronRight size={13}/>):<span className="w-[13px]"/>}{entry.kind==='directory'?<Folder size={14} className="text-indigo-400"/>:<HardDrive size={14}/>}<span className="min-w-0 truncate">{entry.name}</span></button>
    <span className="muted">{entry.kind==='file'?human(entry.size):''}</span>
   </div>
   {entry.kind==='directory'&&expanded.includes(entry.id)&&<div className="ml-5 border-l border-[var(--border)] pl-2">{renderDirectory(entry.id)}</div>}
  </div>)}{page.nextCursor&&<Button size="sm" variant="ghost" onClick={()=>void loadDirectory(id,page.nextCursor||undefined)}>加载更多</Button>}</div>
 }
 const focusLocated=useRef(0)
 useEffect(()=>{
  if(!focus||!snapshot||focusLocated.current===focus.seq)return
  focusLocated.current=focus.seq;setTab('tasks')
  if(!snapshot.tasks.some(x=>x.id===focus.taskId)){msg.info('传输任务已清理，已打开传输记录');return}
  requestAnimationFrame(()=>document.querySelector('[data-dashboard-task-id="'+CSS.escape(focus.taskId)+'"]')?.scrollIntoView({block:'center',behavior:'smooth'}))
 },[focus,snapshot])
 const tabs:[Tab,string,number][]=[
  ['pool','文件池',snapshot?.pool.fileCount||0],['shares','主设备共享',snapshot?.shares.length||0],
  ['messages','消息池',snapshot?.pool.messageCount||0],['tasks','传输记录',snapshot?.tasks.length||0],['devices','设备管理',snapshot?.devices.length||0]
 ]
 const p=snapshot?.prefs
 const usage=snapshot?.pool.usedBytes||0
 const quota=snapshot?.pool.limitBytes||20*1024**3
 const restoreHistory=(result:AddSourcesResult)=>{void load();if(result.errors.length)msg.warning(result.errors.join('\n'));msg.success('已恢复 '+result.added+' 项')}
 return <div className="relative @container mx-auto max-w-[1460px] space-y-4 p-5">
  <header className="flex flex-wrap items-center gap-3">
   <span className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><ToolPageIcon size={24}/></span>
   <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">文件快传</h1><p className="mt-1 text-xs muted">主设备共享 · 全设备文件池 · 文字消息池</p></div>
   <span role="status" className={'rounded-full px-3 py-1.5 text-xs '+(snapshot?.running?'bg-emerald-500/10 text-emerald-400':'bg-[var(--panel-alt)] muted')}>{snapshot?.running?'● 运行中':'○ 未启动'}</span>
  </header>
  <section className={CARD+' space-y-3'}>
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-2"><Wifi size={17} className={snapshot?.running?'text-emerald-400':'muted'}/><div className="min-w-0"><h2 className="text-sm font-semibold">局域网共享服务</h2><p className="mt-1 truncate text-xs muted">{snapshot?.running?snapshot.url||'': '选择本机局域网网卡，然后启动服务'}</p></div></div>
    <div className="flex flex-wrap items-center gap-2">
     {snapshot?.running&&<><Button size="sm" onClick={()=>void copy(snapshot.url||'')}><Copy size={14}/>复制地址</Button><Button size="sm" onClick={()=>setShowQr(v=>!v)}><QrCode size={14}/>二维码 / 访问码</Button></>}
     <Button size="sm" onClick={()=>setShowSettings(v=>!v)}><Settings2 size={14}/>设置</Button>
     <Button size="sm" variant={snapshot?.running?'danger':'primary'} disabled={busy||!snapshot} onClick={snapshot?.running?()=>void stop():start}><Power size={14}/>{snapshot?.running?'停止':'启动'}</Button>
    </div>
   </div>
   {!snapshot?.running&&<div className="max-w-md"><SelectField ariaLabel="选择快传网卡" value={selectedIp} onValueChange={setSelectedIp} options={snapshot?.interfaces.map(x=>({value:x.address,label:x.address,description:x.name}))||[]} placeholder="选择网卡 IPv4" className="w-full"/></div>}
   <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--border)] pt-3 text-xs">
    <span className="muted">文件池容量 <strong className="ml-1 font-semibold text-[var(--foreground)]">{human(usage)} / {human(quota)}</strong></span>
    <div className="h-1.5 min-w-[120px] max-w-[260px] flex-1 overflow-hidden rounded-full bg-[var(--panel-alt)]"><div className="h-full rounded-full bg-indigo-500" style={{width:Math.min(100,usage/quota*100)+'%'}}/></div>
    <span className="muted">消息 {snapshot?.pool.messageCount||0} / 300</span>
    <span className="muted">已连接 {snapshot?.devices.length||0} 台设备</span>
   </div>
   {showQr&&snapshot?.running&&<div className="flex flex-wrap items-center gap-4 rounded-xl bg-[var(--panel-alt)] p-3">
    {qr?<img src={qr} alt="访问二维码" className="h-32 w-32 rounded-lg bg-white p-2"/>:<span className="text-xs muted">二维码生成中...</span>}
    <div className="space-y-2"><p className="text-xs muted">扫描二维码或输入六位访问码连接</p><p className="font-mono text-xl font-bold tracking-[.2em]">{snapshot.pin}</p><Button size="sm" onClick={()=>void copy(snapshot.pin||'')}><Copy size={14}/>复制访问码</Button></div>
   </div>}
   {showSettings&&<div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-4">
    <div className="grid gap-4 @min-[680px]:grid-cols-3">
     <label className="flex items-center justify-between gap-3 text-xs">主设备路径共享下载 <SwitchField ariaLabel="主设备共享下载" checked={Boolean(p?.allowDownload)} onCheckedChange={v=>void setPrefs({allowDownload:v})} disabled={busy||!p}/></label>
     <label className="flex items-center justify-between gap-3 text-xs">文件池允许上传 <SwitchField ariaLabel="文件池上传" checked={Boolean(p?.allowPoolUpload)} onCheckedChange={v=>void setPrefs({allowPoolUpload:v})} disabled={busy||!p}/></label>
     <label className="flex items-center justify-between gap-3 text-xs">文件池允许下载 <SwitchField ariaLabel="文件池下载" checked={Boolean(p?.allowPoolDownload)} onCheckedChange={v=>void setPrefs({allowPoolDownload:v})} disabled={busy||!p}/></label>
    </div>
    <div className="grid items-end gap-3 @min-[680px]:grid-cols-3">
     <div className="space-y-1"><label htmlFor="pool-cap" className="text-xs muted">文件池容量（GiB，1–500）</label><div className="flex gap-2"><Input id="pool-cap" type="number" min={1} max={500} step={1} value={cap} onChange={e=>setCap(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')saveCapacity()}}/><Button size="sm" onClick={saveCapacity} disabled={busy}>应用</Button></div></div>
     <div className="space-y-1"><p className="text-xs muted">同时上传任务</p><SelectField ariaLabel="上传任务并发" value={String(p?.maxUploads||2)} onValueChange={v=>void setPrefs({maxUploads:Number(v)})} options={[1,2,3,4].map(n=>({value:String(n),label:n+' 个'}))}/></div>
     <div className="space-y-1"><p className="text-xs muted">同时下载任务</p><SelectField ariaLabel="下载任务并发" value={String(p?.maxDownloads||4)} onValueChange={v=>void setPrefs({maxDownloads:Number(v)})} options={[1,2,4,6,8].map(n=>({value:String(n),label:n+' 个'}))}/></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="min-w-0 break-all muted">临时文件目录：{p?.tempDirectory||'ToolDock 数据目录 / temp / file-transfer（默认）'}</span><Button size="sm" onClick={()=>void run(()=>window.toolDock.transfer.tempDirectory(),'临时目录已配置，下次启动生效')}>选择目录</Button></div>
    <p className="text-[11px] muted">仅在可信局域网使用，HTTP 未加密；新临时目录下次启动生效。文件池配额不包含超长消息临时文本，后者占用约 {human(snapshot?.pool.messageBytes||0)}。</p>
   </div>}
  </section>
  <section className={CARD+' space-y-4'}>
   <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border)] pb-3" role="tablist" aria-label="快传业务">
    {tabs.map(([id,name,count])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)} className={'shrink-0 rounded-lg px-3 py-2 text-xs '+(tab===id?'bg-indigo-500/15 font-semibold text-indigo-400':'hover:bg-[var(--hover)]')}>{name} <span className="ml-1 muted">{count}</span></button>)}
   </nav>
   {tab==='pool'&&<TransferPoolTab snapshot={snapshot} revision={revision}/>}
   {tab==='messages'&&<TransferMessagesTab snapshot={snapshot}/>}
   {tab==='shares'&&<div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">主设备路径共享</h3><p className="mt-1 text-xs muted">直接读取源文件和目录，不产生文件池副本，也不计入文件池配额。取消共享不会删除原件。</p></div>
     <div className="flex flex-wrap gap-2"><Button size="sm" onClick={()=>setHistoryOpen(true)}><History size={14}/>历史记录</Button><Button size="sm" onClick={()=>void run(()=>window.toolDock.transfer.chooseFolders(),'已添加共享文件夹')}><FolderPlus size={14}/>添加文件夹</Button><Button size="sm" variant="primary" onClick={()=>void run(()=>window.toolDock.transfer.chooseFiles(),'已添加共享文件')}><Plus size={14}/>添加文件</Button></div>
    </div>
    {!snapshot?.shares.length&&<p className="py-10 text-center text-xs muted">还没有共享文件。拖动本地文件或文件夹到窗口即可分享原路径。</p>}
    {snapshot?.shares.map(s=><div key={s.id} className="space-y-2 border-b border-[var(--border)] py-3"><div className="flex min-w-0 items-center gap-3">
     <button disabled={s.kind!=='directory'} onClick={()=>void toggleFolder(s.id)} className="flex shrink-0 items-center gap-1">{s.kind==='directory'?(expanded.includes(s.id)?<ChevronDown size={14}/>:<ChevronRight size={14}/>):<span className="w-[14px]"/>}{s.kind==='directory'?<Folder size={18} className="text-indigo-400"/>:<HardDrive size={17} className="text-indigo-400"/>}</button>
     <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{s.name}</p><p className="mt-1 truncate text-[11px] muted" title={s.path}>{s.path} · {s.kind==='directory'?'文件夹':human(s.size)} · {s.status==='ready'?'可访问':'源文件已变更'}</p>{directoryStats[s.id]&&<p className="text-[11px] muted">{directoryStats[s.id].files} 文件 / {directoryStats[s.id].directories} 子目录 · {human(directoryStats[s.id].bytes)}</p>}</div>
     {s.kind==='directory'&&<Button size="sm" variant="ghost" onClick={()=>void window.toolDock.transfer.directoryStats(s.id).then(stats=>setDirectoryStats(old=>({...old,[s.id]:stats}))).catch(e=>msg.error(e))}>详情</Button>}
     <Button size="sm" variant="ghost" disabled={!snapshot.running||s.status!=='ready'} onClick={()=>void run(async()=>{const r=await window.toolDock.transfer.pool.add([s.path||'']);if(r.errors.length)throw Error(r.errors.join('\n'))},'已复制到文件池')}><Save size={14}/>复制到文件池</Button>
     <Button size="sm" variant="danger" onClick={()=>void run(()=>window.toolDock.transfer.removeShare(s.id),'已取消共享，源文件未删除')}><X size={14}/>移除</Button>
    </div>
    {s.kind==='directory'&&expanded.includes(s.id)&&<div className="ml-7 border-l border-[var(--border)] pl-3">{renderDirectory(s.id)}</div>}
   </div>)}
   </div>}
   {tab==='tasks'&&<div className="space-y-3">
    <h3 className="text-sm font-semibold">本次会话传输记录</h3>
    {!snapshot?.tasks.length&&<p className="py-10 text-center text-xs muted">暂无传输记录</p>}
    {snapshot?.tasks.map(t=><div key={t.id} data-dashboard-task-id={t.id} className={'space-y-2 border-b border-[var(--border)] py-2 '+(focus?.taskId===t.id?'bg-indigo-500/10':'')}>
     <div className="flex justify-between gap-3 text-xs"><span className="truncate">{t.direction==='download'?'下载':'上传'} · {t.name}</span><span className="muted">{t.status}</span></div>
     <progress value={t.completed} max={Math.max(1,t.total)} className="h-1.5 w-full"/><div className="flex justify-between text-[11px] muted"><span>{human(t.completed)} / {human(t.total)} · {t.ip}</span>{['running','uploading','paused'].includes(t.status)&&<Button size="sm" variant="danger" onClick={()=>void dialog.confirmAction({title:'取消传输任务',description:'取消「'+t.name+'」的传输？',variant:'danger',confirmText:'取消任务',onConfirm:()=>window.toolDock.transfer.cancelTask(t.id)})}>取消</Button>}</div>
    </div>)}
   </div>}
   {tab==='devices'&&<div className="space-y-3">
    <h3 className="text-sm font-semibold">已授权设备</h3>
    {!snapshot?.devices.length&&<p className="py-10 text-center text-xs muted">暂无已授权设备</p>}
    {snapshot?.devices.map(d=><div key={d.id} className="flex items-center gap-3 border-b border-[var(--border)] py-3"><Users size={18}/><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{d.name||d.agent}</p><p className="text-[11px] muted">{d.ip} · 最近活动 {new Date(d.lastSeen).toLocaleTimeString()}</p></div><Button size="sm" variant="danger" onClick={()=>void dialog.confirmAction({title:'断开设备',description:'撤销 '+d.ip+' 的共享访问权限？',variant:'danger',onConfirm:()=>window.toolDock.transfer.revokeDevice(d.id)})}>断开</Button></div>)}
   </div>}
  </section>
  <DropOverlay visible={dropOver} label={tab==='pool'?'释放以添加到共享文件池':'释放以分享主设备原路径'}/>
  <ShareHistoryDialog open={historyOpen} onClose={()=>setHistoryOpen(false)} onRestored={restoreHistory}/>
 </div>
}
