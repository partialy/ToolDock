import {useEffect,useMemo,useRef,useState} from 'react'
import {Activity,AlertTriangle,CheckCircle2,ChevronDown,Copy,FolderOpen,Link2,RefreshCw,Search,ShieldAlert,Terminal,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {SelectField} from '@/components/ui/select-field'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {useDialog} from '@/components/ui/dialog-provider'
import type {JunctionInput,JunctionPreview,JunctionResult,PortEntry,PortQueryResult} from '@/shared/commandModels'

type Tab='port'|'junction'
const CARD='min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5'
const errText=(e:unknown)=>e instanceof Error?e.message:String(e)
function Address({address,port}:{address:string|null;port:number|null}){
 return <span className="font-mono text-xs whitespace-nowrap">{address?address+(port?':'+port:''):'—'}</span>
}
function Field({label,value,onChange,onPick,placeholder,disabled}:{label:string;value:string;onChange:(v:string)=>void;onPick?:()=>void;placeholder:string;disabled:boolean}){
 return <label className="block min-w-0 space-y-2"><span className="text-xs font-medium muted">{label}</span><span className="flex gap-2"><Input value={value} placeholder={placeholder} spellCheck={false} onChange={e=>onChange(e.target.value)} disabled={disabled} aria-label={label}/>{onPick&&<Button disabled={disabled} type="button" onClick={onPick} title="选择文件夹"><FolderOpen size={17}/> 选择</Button>}</span></label>
}
export function CommandToolPage(){
 const dialog=useDialog()
 const [tab,setTab]=useState<Tab>('port')
 const [portText,setPortText]=useState('8080')
 const [portResult,setPortResult]=useState<PortQueryResult|null>(null)
 const [portError,setPortError]=useState('')
 const [portWorking,setPortWorking]=useState(false)
 const [protocol,setProtocol]=useState('all')
 const [state,setState]=useState('all')
 const [killInfo,setKillInfo]=useState('')
 const [junction,setJunction]=useState<JunctionInput>({target:'',parent:'',name:''})
 const [preview,setPreview]=useState<JunctionPreview|null>(null)
 const [previewKey,setPreviewKey]=useState('')
 const [junctionResult,setJunctionResult]=useState<JunctionResult|null>(null)
 const [junctionError,setJunctionError]=useState('')
 const [junctionWorking,setJunctionWorking]=useState(false)
 const [validating,setValidating]=useState(false)
 const [copyMessage,setCopyMessage]=useState('')
 const requestId=useRef(0)
 const key=JSON.stringify(junction)
 const portValid=/^\d{1,5}$/.test(portText)&&Number(portText)>0&&Number(portText)<=65535
 const filtered=useMemo(()=>portResult?.rows.filter(r=>(protocol==='all'||r.protocol===protocol)&&(state==='all'||r.state===state))||[],[portResult,protocol,state])
 const states=useMemo(()=>Array.from(new Set(portResult?.rows.map(r=>r.state)||[])),[portResult])
 const uniquePids=useMemo(()=>new Set(portResult?.rows.map(r=>r.pid)||[]).size,[portResult])
 const [busyPick,setBusyPick]=useState(false)
 useEffect(()=>{
  if(!junction.target.trim()||!junction.parent.trim()||!junction.name.trim()){
   setPreview(null);setPreviewKey('');setValidating(false);return
  }
  const token=++requestId.current
  setValidating(true);setPreview(null);setPreviewKey('')
  const timer=setTimeout(()=>{
   void window.toolDock.commands.validateJunction(junction).then(value=>{
    if(token===requestId.current){setPreview(value);setPreviewKey(key)}
   }).catch(e=>{if(token===requestId.current){setPreview(null);setJunctionError(errText(e))}})
   .finally(()=>{if(token===requestId.current)setValidating(false)})
  },300)
  return()=>{clearTimeout(timer);requestId.current++}
 },[key])
 const copy=async(value:string)=>{
  try{await navigator.clipboard.writeText(value);setCopyMessage('已复制');setTimeout(()=>setCopyMessage(''),2000)}
  catch(e){setCopyMessage('复制失败：'+errText(e))}
 }
 const query=async()=>{
  if(!portValid||portWorking)return
  setPortWorking(true);setPortError('');setKillInfo('');setPortResult(null)
  try{const result=await window.toolDock.commands.queryPort(Number(portText));setPortResult(result);setState('all');setProtocol('all')}
  catch(e){setPortError(errText(e))}
  finally{setPortWorking(false)}
 }
 const terminate=async(row:PortEntry)=>{
  if(!row.canTerminate||!row.startedAt||!row.name||!portResult||portWorking)return
  const confirmed=await dialog.confirm({
   title:'结束整个进程？',variant:'danger',confirmText:'结束进程',
   description:'进程：'+row.name+'（PID '+row.pid+'）\n端口：'+portResult.port+'\n该操作会终止整个进程，而不只是释放这一个端口，其他端口和服务也可能中断。'
  })
  if(!confirmed)return
  setPortWorking(true);setPortError('');setKillInfo('')
  try{
   const value=await window.toolDock.commands.terminate({port:portResult.port,pid:row.pid,startedAt:row.startedAt,name:row.name})
   setKillInfo('已结束 '+value.name+'（PID '+value.pid+'），耗时 '+value.durationMs+' ms')
   const latest=await window.toolDock.commands.queryPort(portResult.port)
   setPortResult(latest)
  }catch(e){setPortError(errText(e))}
  finally{setPortWorking(false)}
 }
 const update=(patch:Partial<JunctionInput>)=>{setJunction(old=>({...old,...patch}));setJunctionResult(null);setJunctionError('')}
 const pick=async(field:'target'|'parent')=>{
  if(busyPick||junctionWorking)return
  setBusyPick(true);setJunctionError('')
  try{const p=await window.toolDock.commands.chooseDirectory();if(p)update({[field]:p})}
  catch(e){setJunctionError(errText(e))}
  finally{setBusyPick(false)}
 }
 const create=async()=>{
  if(junctionWorking||validating||previewKey!==key||!preview?.valid)return
  const yes=await dialog.confirm({title:'创建 Junction 链接？',variant:'confirm',confirmText:'确认创建',
   description:'目标目录：'+preview.target+'\n新链接路径：'+preview.linkPath+'\n现有文件夹不会被移动或删除，遇到重名路径会拒绝创建。'})
  if(!yes)return
  setJunctionWorking(true);setJunctionError('');setJunctionResult(null)
  try{
   const result=await window.toolDock.commands.createJunction(junction)
   setJunctionResult(result)
   setPreview(null);setPreviewKey('')
  }catch(e){setJunctionError(errText(e))}
  finally{setJunctionWorking(false)}
 }
 const open=async(p:string)=>{try{await window.toolDock.commands.openFolder(p)}catch(e){setJunctionError(errText(e))}}
 return <div className="@container mx-auto max-w-[1500px] space-y-5 p-5">
  <header className="flex flex-wrap items-center gap-3"><span className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><ToolPageIcon size={24}/></span><div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">命令执行</h1><p className="mt-1 text-xs muted">Windows 本地系统工具 · 仅支持内置操作，不执行自定义脚本</p></div><span className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs muted"><ShieldAlert size={13} className="mr-1 inline"/> 当前用户权限</span></header>
  <div role="tablist" aria-label="命令执行功能" className="inline-flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1">
   <button role="tab" aria-selected={tab==='port'} onClick={()=>setTab('port')} className={'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm '+(tab==='port'?'bg-indigo-500/15 font-semibold text-indigo-400':'muted hover:bg-[var(--hover)]')}><Activity size={16}/> 端口管理</button>
   <button role="tab" aria-selected={tab==='junction'} onClick={()=>setTab('junction')} className={'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm '+(tab==='junction'?'bg-indigo-500/15 font-semibold text-indigo-400':'muted hover:bg-[var(--hover)]')}><Link2 size={16}/> Junction 链接</button>
  </div>
  {tab==='port'?<div className="grid items-start gap-4 @min-[1100px]:grid-cols-[minmax(290px,.8fr)_minmax(0,1.7fr)]">
   <section className={CARD+' space-y-4'}>
    <div><h2 className="font-semibold">查询端口占用</h2><p className="mt-1 text-xs leading-6 muted">查询本机 TCP/UDP 连接与端点，不会修改系统状态。</p></div>
    <label className="block space-y-2"><span className="text-xs font-medium muted">端口号（1–65535）</span><Input inputMode="numeric" value={portText} placeholder="例如 8080" onChange={e=>setPortText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void query()}} disabled={portWorking} aria-label="端口号"/></label>
    {portText&&!portValid&&<p role="alert" className="text-xs text-amber-400">请输入 1–65535 范围的端口号</p>}
    <Button variant="primary" disabled={!portValid||portWorking} onClick={()=>void query()}><Search size={16}/>{portWorking?'正在查询 / 执行…':'查询端口'}</Button>
    <div className="rounded-xl bg-[var(--panel-alt)] p-3 text-xs leading-6 muted">结束操作会终止整个 PID 对应的进程，不只是释放当前端口。为降低误操作风险，关键系统进程及 ToolDock 自身进程不可结束。</div>
   </section>
   <section className={CARD+' space-y-4'}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">查询结果</h2><p className="mt-1 text-xs muted">{portResult?'端口 '+portResult.port+' · '+portResult.rows.length+' 条连接 / 端点 · '+uniquePids+' 个 PID · '+portResult.durationMs+' ms':'输入端口并开始查询'}</p></div>{portResult&&<Button size="sm" disabled={portWorking} onClick={()=>void query()}><RefreshCw size={14}/> 刷新</Button>}</div>
    {killInfo&&<div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-400"><CheckCircle2 size={15} className="mr-2 inline"/>{killInfo}</div>}
    {portError&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400"><AlertTriangle size={15} className="mr-2 inline"/>{portError}</div>}
    {portResult&&portResult.rows.length>0&&<div className="flex flex-wrap gap-2"><SelectField ariaLabel="协议筛选" value={protocol} onValueChange={setProtocol} options={[{value:'all',label:'全部协议'},{value:'TCP',label:'TCP'},{value:'UDP',label:'UDP'}]} className="min-w-36"/><SelectField ariaLabel="连接状态筛选" value={state} onValueChange={setState} options={[{value:'all',label:'全部状态'},...states.map(s=>({value:s,label:s}))]} className="min-w-36"/></div>}
    {portResult?(portResult.rows.length===0?<div className="rounded-xl border border-dashed border-[var(--border)] py-14 text-center text-sm muted">未发现占用该本地端口的 TCP/UDP 连接</div>:<div className="overflow-x-auto rounded-xl border border-[var(--border)]"><table className="w-full min-w-[770px] text-left text-xs"><thead className="bg-[var(--panel-alt)] text-[var(--muted)]"><tr><th className="p-3">协议</th><th className="p-3">本地地址</th><th className="p-3">远程地址</th><th className="p-3">状态</th><th className="p-3">进程</th><th className="p-3">PID</th><th className="p-3">操作</th></tr></thead><tbody>{filtered.map((r,i)=><tr key={r.protocol+'-'+r.pid+'-'+r.localAddress+'-'+r.localPort+'-'+i} className="border-t border-[var(--border)]"><td className="p-3">{r.protocol}<span className="ml-1 text-[10px] muted">{r.family==='IPv6'?'v6':'v4'}</span></td><td className="p-3"><Address address={r.localAddress} port={r.localPort}/></td><td className="p-3"><Address address={r.remoteAddress} port={r.remotePort}/></td><td className="p-3">{r.state}</td><td className="max-w-44 truncate p-3" title={r.executablePath||r.name||'未知'}>{r.name?<button className="hover:text-indigo-400" onClick={()=>void copy(r.name!)} title="复制进程名称">{r.name} <Copy size={11} className="inline"/></button>:'未知'}</td><td className="p-3"><button title="复制 PID" onClick={()=>void copy(String(r.pid))} className="font-mono hover:text-indigo-400">{r.pid} <Copy size={11} className="inline"/></button></td><td className="p-3">{r.canTerminate?<Button variant="danger" size="sm" disabled={portWorking} onClick={()=>void terminate(r)}><Trash2 size={13}/>结束</Button>:<span className="text-[11px] muted" title={r.blockReason||''}>不可结束</span>}</td></tr>)}</tbody></table>{filtered.length===0&&<p className="p-5 text-center text-xs muted">当前筛选条件没有匹配记录</p>}</div>):<div className="rounded-xl border border-dashed border-[var(--border)] py-14 text-center text-sm muted"><Terminal size={24} className="mx-auto mb-3 opacity-50"/>暂无查询结果</div>}
    {portResult&&<details className="group rounded-xl bg-[var(--panel-alt)] p-3 text-xs"><summary className="cursor-pointer select-none text-[var(--muted)]"><ChevronDown size={14} className="mr-1 inline"/> 技术详情（原始 PowerShell JSON / 结构化数据）</summary><pre className="mt-3 max-h-72 overflow-auto break-words whitespace-pre-wrap font-mono text-[11px]">{JSON.stringify(portResult,null,2)}</pre><Button size="sm" onClick={()=>void copy(JSON.stringify(portResult,null,2))}><Copy size={13}/> 复制结果</Button></details>}
   </section>
  </div>:<div className="grid items-start gap-4 @min-[1100px]:grid-cols-[minmax(300px,1fr)_minmax(0,1fr)]">
   <section className={CARD+' space-y-4'}>
    <div><h2 className="font-semibold">创建 Junction 目录链接</h2><p className="mt-1 text-xs leading-6 muted">目标目录和父目录必须已经存在。链接名称必须是尚未占用的新文件夹名称。</p></div>
    <Field label="目标目录（已存在）" value={junction.target} onChange={v=>update({target:v})} onPick={()=>void pick('target')} placeholder="例如 D:\\Projects\\Shared" disabled={junctionWorking||busyPick}/>
    <Field label="链接所在父目录（已存在）" value={junction.parent} onChange={v=>update({parent:v})} onPick={()=>void pick('parent')} placeholder="例如 E:\\Workspace" disabled={junctionWorking||busyPick}/>
    <Field label="新链接名称" value={junction.name} onChange={v=>update({name:v})} placeholder="例如 Shared" disabled={junctionWorking||busyPick}/>
    <div className="rounded-xl bg-[var(--panel-alt)] p-3 text-xs"><p className="mb-2 muted">最终链接路径</p><p className="break-all font-mono">{preview?.linkPath||[junction.parent,junction.name].filter(Boolean).join('\\')||'等待填写'}</p></div>
    {validating&&<p className="text-xs muted">正在校验路径…</p>}
    {previewKey===key&&preview&&<div role="status" className={'rounded-xl border p-3 text-xs '+(preview.valid?'border-emerald-500/30 text-emerald-400':'border-amber-500/30 text-amber-400')}>{preview.valid?'目标与链接路径已通过预检查':preview.reason}</div>}
    <Button variant="primary" disabled={junctionWorking||validating||previewKey!==key||!preview?.valid} onClick={()=>void create()}><Link2 size={16}/>{junctionWorking?'正在创建…':'创建 Junction'}</Button>
    <div className="rounded-xl bg-[var(--panel-alt)] p-3 text-xs leading-6 muted">仅支持本地磁盘路径，不会移动或覆盖任何现有文件夹。创建成功后，访问新链接路径即访问原目标文件夹。首期不提供删除或修改链接。</div>
   </section>
   <section className={CARD+' space-y-4'}>
    <div><h2 className="font-semibold">执行结果</h2><p className="mt-1 text-xs muted">只保留本次页面会话的数据，不写入数据库</p></div>
    {junctionError&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400"><AlertTriangle size={15} className="mr-2 inline"/>{junctionError}</div>}
    {junctionResult?<div className="space-y-4"><div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-400"><CheckCircle2 size={17}/> Junction 创建成功</div><div className="space-y-3 text-xs"><div><p className="mb-1 muted">目标目录</p><p className="break-all font-mono">{junctionResult.target}</p><Button size="sm" variant="ghost" onClick={()=>void copy(junctionResult.target)}><Copy size={13}/>复制目标路径</Button></div><div><p className="mb-1 muted">Junction 链接</p><p className="break-all font-mono">{junctionResult.linkPath}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={()=>void copy(junctionResult.linkPath)}><Copy size={13}/>复制链接路径</Button><Button size="sm" onClick={()=>void open(junctionResult.linkPath)}><FolderOpen size={13}/>打开链接文件夹</Button></div></div><p className="muted">执行耗时 {junctionResult.durationMs} ms · 类型 Junction（目录联接）</p></div></div>:<div className="rounded-xl border border-dashed border-[var(--border)] py-14 text-center text-sm muted"><FolderOpen size={26} className="mx-auto mb-3 opacity-50"/>创建成功后显示链接详情</div>}
   </section>
  </div>}
  {copyMessage&&<p role="status" className="fixed bottom-6 right-6 z-50 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-xs shadow-lg">{copyMessage}</p>}
 </div>
}
