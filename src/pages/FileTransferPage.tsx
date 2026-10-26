import {useCallback,useEffect,useMemo,useState} from 'react'
import {ArrowDownToLine,ArrowUpFromLine,BellRing,Check,Copy,Download,FolderOpen,HardDrive,MonitorUp,Plus,Power,RefreshCw,ShieldCheck,Trash2,Users,Wifi,X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {useDialog} from '@/components/ui/dialog-provider'
import {qrBlob} from '@/lib/qr/render'
import {defaultQrConfig} from '@/lib/qr/config'
import type {TransferSnapshot,TransferPreferences} from '@/shared/fileTransferModels'
const CARD='min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5'
const human=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GiB':n>=1024**2?(n/1024**2).toFixed(1)+' MiB':(n/1024).toFixed(1)+' KiB'
const fallback=(v:unknown)=>v instanceof Error?v.message:String(v)
export function FileTransferPage(){
 const dialog=useDialog()
 const [snapshot,setSnapshot]=useState<TransferSnapshot|null>(null)
 const [selectedIp,setSelectedIp]=useState('')
 const [tab,setTab]=useState<'shares'|'incoming'|'tasks'|'devices'>('shares')
 const [qr,setQr]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const pending=snapshot?.incoming.filter(x=>x.status==='pending')||[]
 const [checked,setChecked]=useState<string[]>([])
 const load=useCallback(()=>window.toolDock.transfer.status().then(next=>{setSnapshot(next);setSelectedIp(old=>old||next.address||next.interfaces[0]?.address||'')}),[])
 useEffect(()=>{void load().catch(e=>setError(fallback(e)));return window.toolDock.transfer.onChange(next=>setSnapshot(next))},[load])
 useEffect(()=>{
  const listener=()=>setTab('incoming')
  window.addEventListener('tooldock:show-incoming',listener)
  return()=>window.removeEventListener('tooldock:show-incoming',listener)
 },[])
 useEffect(()=>{
  let canceled=false,url=''
  if(!snapshot?.qrUrl){setQr('');return}
  void qrBlob({config:{...defaultQrConfig,kind:'url',url:snapshot.qrUrl,size:384,dotStyle:'square'},revision:0},'png')
   .then(blob=>{url=URL.createObjectURL(blob);if(!canceled)setQr(url);else URL.revokeObjectURL(url)})
   .catch(()=>setQr(''))
  return()=>{canceled=true;if(url)URL.revokeObjectURL(url)}
 },[snapshot?.qrUrl])
 const run=async(action:()=>Promise<unknown>,message='操作成功')=>{
  setBusy(true);setError('');setSuccess('')
  try{await action();await load();setSuccess(message)}
  catch(e){setError(fallback(e))}
  finally{setBusy(false)}
 }
 const start=()=>void run(async()=>{if(!selectedIp)throw Error('请选择局域网 IP');await window.toolDock.transfer.start(selectedIp)},'局域网服务器已启动')
 const stop=async()=>{
  if(!snapshot?.running)return
  const yes=await dialog.confirm({title:'停止文件服务器',description:pending.length?'当前还有 '+pending.length+' 个文件等待确认。停止服务会删除所有未接收的暂存文件，是否继续？':'停止后所有访问码和二维码会立即失效，正在进行的传输将中断。',variant:'warning',confirmText:'确认停止'})
  if(yes)await run(()=>window.toolDock.transfer.stop(),'文件服务器已停止')
 }
 const setPrefs=async(partial:Partial<TransferPreferences>)=>{
  if(!snapshot)return
  const prefs={...snapshot.prefs,...partial}
  await run(()=>window.toolDock.transfer.setPrefs(prefs),'设置已保存')
 }
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setSuccess('已复制到剪贴板')}catch(e){setError(fallback(e))}}
 const approve=async(ids:string[])=>{
  if(!ids.length)return
  const total=pending.filter(v=>ids.includes(v.id)).reduce((n,v)=>n+v.size,0)
  if(!await dialog.confirm({title:'确认接收文件',description:'准备接收 '+ids.length+' 个文件（合计 '+human(total)+'）。\n保存到：'+(snapshot?.prefs.receiveDirectory||'尚未设置')+'\n同名文件会自动重命名，不覆盖已有文件。',variant:'confirm',confirmText:'确认接收'}))return
  await run(async()=>{
   const res=await window.toolDock.transfer.approveMany(ids)
   const failures=res.filter(x=>!x||typeof x!=='object'||(x as {ok:boolean}).ok!==true)
   if(failures.length)throw Error('部分文件保存失败：'+failures.map(f=>String((f as {error?:string}).error||'未知原因')).join('; '))
   setChecked([])
  },'文件已保存到电脑接收目录')
 }
 const reject=async(ids:string[])=>{
  if(!await dialog.confirm({title:'拒绝接收文件',description:'拒绝 '+ids.length+' 个文件将立即删除隔离暂存中的内容，无法从电脑恢复。',variant:'danger',confirmText:'确认拒绝'}))return
  await run(()=>window.toolDock.transfer.rejectMany(ids),'已拒绝并清理暂存文件');setChecked([])
 }
 const tabs=[{id:'shares',name:'分享文件',count:snapshot?.shares.length||0},{id:'incoming',name:'待接收',count:pending.length},{id:'tasks',name:'传输记录',count:snapshot?.tasks.length||0},{id:'devices',name:'已连接设备',count:snapshot?.devices.length||0}] as const
 return <div className="@container mx-auto max-w-[1460px] space-y-4 p-5">
  <header className="flex flex-wrap items-center gap-3"><span className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><MonitorUp size={24}/></span><div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">文件快传</h1><p className="mt-1 text-xs muted">在可信局域网内共享文件、接收设备上传 · 纯本地传输</p></div>
   <span role="status" className={'rounded-full px-3 py-1.5 text-xs '+(snapshot?.running?'bg-emerald-500/10 text-emerald-400':'bg-[var(--panel-alt)] muted')}>{snapshot?.running?'● 运行中':'○ 未启动'}</span>
  </header>
  <div className="grid items-start gap-4 @min-[980px]:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
   <section className={CARD}>
    <div className="flex items-center justify-between"><h2 className="font-semibold"><Wifi size={17} className="mr-2 inline"/>局域网服务器</h2><Button variant={snapshot?.running?'danger':'primary'} disabled={busy||!snapshot} onClick={snapshot?.running?()=>void stop():start}><Power size={15}/>{snapshot?.running?'停止服务':'启动服务'}</Button></div>
    {!snapshot?.running?<div className="space-y-3"><p className="text-xs muted">使用系统随机端口，仅绑定选定的私有 IPv4。首次开放局域网端口时，请在 Windows 防火墙中允许专用网络访问。</p>
     <label className="block text-xs muted">选择本机网卡 / IPv4</label><select aria-label="快传网卡" value={selectedIp} onChange={e=>setSelectedIp(e.target.value)} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-xs">{snapshot?.interfaces.map(n=><option value={n.address} key={n.id}>{n.name} — {n.address}</option>)}</select>
     {!snapshot?.interfaces.length&&<p className="text-xs text-amber-400">没有找到可用私有网卡，请连接家庭/办公网络。</p>}
    </div>:<div className="space-y-3"><p className="text-xs muted">其他设备访问以下地址，输入访问码，或直接扫描二维码。</p>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--panel-alt)] p-3"><span className="min-w-0 flex-1 break-all font-mono text-sm">{snapshot.url}</span><Button size="sm" onClick={()=>void copy(snapshot.url||'')}><Copy size={14}/> 复制</Button></div>
      <div className="flex items-center gap-3"><div className="flex-1"><div className="text-xs muted">访问码（每次启动重新生成）</div><div className="mt-1 font-mono text-2xl font-bold tracking-[0.2em]">{snapshot.pin}</div></div><Button size="sm" onClick={()=>void copy(snapshot.pin||'')}><Copy size={14}/> 复制访问码</Button></div>
    </div>}
    <div className="grid gap-3 border-t border-[var(--border)] pt-4 @min-[660px]:grid-cols-2">
     <label className="flex items-center justify-between gap-3 text-xs">允许手机下载 <input type="checkbox" checked={Boolean(snapshot?.prefs.allowDownload)} onChange={e=>void setPrefs({allowDownload:e.target.checked})}/></label>
     <label className="flex items-center justify-between gap-3 text-xs">允许设备上传 <input type="checkbox" checked={Boolean(snapshot?.prefs.allowUpload)} onChange={e=>void setPrefs({allowUpload:e.target.checked})} disabled={!snapshot?.prefs.receiveDirectory}/></label>
    </div>
    <div className="grid gap-3 rounded-xl border border-[var(--border)] p-3 @min-[660px]:grid-cols-2">
     <label className="space-y-1 text-xs muted"><span className="block">单文件上限</span><select aria-label="单文件上限" value={snapshot?.prefs.maxFileBytes||10*1024**3} onChange={e=>{const n=Number(e.target.value);void setPrefs({maxFileBytes:n,maxTempBytes:Math.max(n,snapshot?.prefs.maxTempBytes||n)})}} className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-2">
      {[1,5,10,20,50].map(n=><option key={n} value={n*1024**3}>{n} GiB</option>)}</select></label>
     <label className="space-y-1 text-xs muted"><span className="block">暂存容量上限</span><select aria-label="暂存容量上限" value={snapshot?.prefs.maxTempBytes||20*1024**3} onChange={e=>void setPrefs({maxTempBytes:Number(e.target.value)})} className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-2">
      {[10,20,50,100].filter(n=>n*1024**3>=(snapshot?.prefs.maxFileBytes||10*1024**3)).map(n=><option key={n} value={n*1024**3}>{n} GiB</option>)}</select></label>
     <label className="space-y-1 text-xs muted"><span className="block">同时上传任务</span><select aria-label="上传并发" value={snapshot?.prefs.maxUploads||2} onChange={e=>void setPrefs({maxUploads:Number(e.target.value)})} className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-2">{[1,2,3,4].map(n=><option key={n}>{n}</option>)}</select></label>
     <label className="space-y-1 text-xs muted"><span className="block">同时下载任务</span><select aria-label="下载并发" value={snapshot?.prefs.maxDownloads||4} onChange={e=>void setPrefs({maxDownloads:Number(e.target.value)})} className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-2">{[1,2,4,6,8].map(n=><option key={n}>{n}</option>)}</select></label>
    </div>
    <div className="rounded-xl bg-[var(--panel-alt)] p-3"><div className="flex items-center gap-2 text-xs"><FolderOpen size={15}/> 接收文件目录</div><div className="mt-2 flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-all text-xs muted">{snapshot?.prefs.receiveDirectory||'尚未选择（上传功能不可用）'}</span><Button size="sm" onClick={()=>void run(()=>window.toolDock.transfer.chooseDirectory(),'目录已更新')}>选择目录</Button></div></div>
    <p className="text-[11px] muted">仅供可信局域网使用。HTTP 未加密；访问码不能防止同一网络中的流量窃听。</p>
   </section>
   <section className={CARD+' text-center'}>
    <h2 className="text-left font-semibold">扫码连接</h2>
    <div className="mx-auto flex aspect-square max-w-[290px] items-center justify-center rounded-2xl bg-white p-4">{snapshot?.running&&qr?<img src={qr} alt="含临时授权令牌的访问二维码" className="h-full w-full object-contain"/>:<div className="text-center text-sm text-slate-500">启动服务后显示二维码</div>}</div>
    <p className="text-xs muted">扫码直达手机网页并授权；每次启动会生成新二维码。</p>
   </section>
  </div>
  <section className={CARD}>
   <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3" role="tablist" aria-label="文件快传功能">{tabs.map(t=><button role="tab" aria-selected={tab===t.id} key={t.id} className={'rounded-lg px-3 py-2 text-xs '+(tab===t.id?'bg-indigo-500/15 font-semibold text-indigo-400':'hover:bg-[var(--hover)]')} onClick={()=>setTab(t.id)}>{t.name} <span className="muted">{t.count}</span></button>)}</div>
   {tab==='shares'&&<div className="space-y-3"><div className="flex items-center justify-between"><div className="text-xs muted">只有这里明确选择的文件可以被下载；移除分享不会删除电脑中的原文件。</div><Button size="sm" variant="primary" onClick={()=>void run(()=>window.toolDock.transfer.chooseShares(),'分享列表已更新')}><Plus size={15}/> 添加文件</Button></div>
    {!snapshot?.shares.length&&<p className="py-12 text-center text-sm muted">还没有共享文件。点击“添加文件”选择任意类型的文件。</p>}
    {snapshot?.shares.map(s=><div key={s.id} className="flex items-center gap-3 border-b border-[var(--border)] py-3"><HardDrive size={17} className="text-indigo-400"/><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium" title={s.name}>{s.name}</p><p className="mt-1 text-[11px] muted">{human(s.size)} · {s.status==='ready'?'可下载':'文件已变化/丢失'}</p></div><Button size="sm" variant="ghost" onClick={()=>void run(()=>window.toolDock.transfer.removeShare(s.id),'已取消共享，不影响原文件')}><X size={15}/> 移除</Button></div>)}
   </div>}
   {tab==='incoming'&&<div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-xs muted">远端文件上传完毕后才会列在这里，电脑确认前绝不保存到正式接收目录。</div><div className="flex gap-2"><Button size="sm" disabled={!checked.length} onClick={()=>void approve(checked)}><Check size={14}/> 批量接收</Button><Button size="sm" disabled={!checked.length} variant="danger" onClick={()=>void reject(checked)}><Trash2 size={14}/> 批量拒绝</Button></div></div>
    {!pending.length&&<p className="py-12 text-center text-sm muted">暂无等待接收的文件</p>}
    {pending.map(u=><div key={u.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] py-3"><input type="checkbox" aria-label={'选择 '+u.name} checked={checked.includes(u.id)} onChange={e=>setChecked(old=>e.target.checked?[...old,u.id]:old.filter(x=>x!==u.id))}/><ArrowUpFromLine size={17} className="text-indigo-400"/><div className="min-w-0 flex-1"><p className="break-all text-xs font-medium">{u.name}</p><p className="mt-1 text-[11px] muted">{human(u.size)} · 来自 {u.ip}</p></div><Button size="sm" onClick={()=>void approve([u.id])}>接收</Button><Button size="sm" variant="danger" onClick={()=>void reject([u.id])}>拒绝</Button></div>)}
   </div>}
   {tab==='tasks'&&<div className="space-y-3">{!snapshot?.tasks.length&&<p className="py-12 text-center text-sm muted">本次会话暂无传输记录</p>}{snapshot?.tasks.map(t=><div className="space-y-2 border-b border-[var(--border)] py-2" key={t.id}><div className="flex justify-between gap-3 text-xs"><span className="truncate">{t.direction==='download'?'下载':'上传'} · {t.name}</span><span className="muted">{t.status}</span></div><progress value={t.completed} max={t.total} className="w-full"/><p className="text-[11px] muted">{human(t.completed)} / {human(t.total)} · {t.ip}</p>{['running','uploading','paused'].includes(t.status)&&<Button size="sm" variant="danger" onClick={()=>void dialog.confirmAction({title:'取消传输任务',description:'取消「'+t.name+'」传输？未接收的暂存内容将被删除。',variant:'danger',confirmText:'取消任务',onConfirm:()=>window.toolDock.transfer.cancelTask(t.id)})}>取消任务</Button>}</div>)}</div>}
   {tab==='devices'&&<div className="space-y-3">{!snapshot?.devices.length&&<p className="py-12 text-center text-sm muted">暂无已授权设备</p>}{snapshot?.devices.map(device=><div key={device.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] py-3"><Users size={18}/><div className="min-w-0 flex-1"><p className="truncate text-xs">{device.agent}</p><p className="text-[11px] muted">{device.ip} · 最后活动：{new Date(device.lastSeen).toLocaleTimeString()}</p></div><Button size="sm" variant="danger" onClick={()=>void dialog.confirmAction({title:'断开设备',description:'是否立即撤销 '+device.ip+' 的访问权限？',variant:'danger',onConfirm:async()=>{await window.toolDock.transfer.revokeDevice(device.id)}})}>断开</Button></div>)}</div>}
  </section>
  {error&&<p role="alert" className="rounded-xl border border-red-500/30 p-3 text-xs text-red-400">{error}</p>}{success&&<p role="status" className="text-xs text-emerald-400">{success}</p>}
 </div>
}
