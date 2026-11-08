import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {useVirtualizer} from '@tanstack/react-virtual'
import {Copy,FileText,RefreshCw,Search,Send,Trash2,Download,ChevronLeft,ChevronRight} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {DialogShell} from '@/components/ui/dialog-shell'
import {useDialog} from '@/components/ui/dialog-provider'
import {msg} from '@/components/ui/message'
import type {PoolMessage,PoolMessagesPage,TransferSnapshot} from '@/shared/fileTransferModels'

const human=(n:number)=>n>=1024**2?(n/1024**2).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':n+' B'
export function TransferMessagesTab({snapshot}:{snapshot:TransferSnapshot|null}){
 const dialog=useDialog()
 const [list,setList]=useState<PoolMessagesPage>({items:[],total:0})
 const [text,setText]=useState('')
 const [sending,setSending]=useState(false)
 const [viewer,setViewer]=useState<PoolMessage|null>(null)
 const [chunk,setChunk]=useState({text:'',nextOffset:0,done:true})
 const [positions,setPositions]=useState<number[]>([])
 const [currentOffset,setCurrentOffset]=useState(0)
 const [query,setQuery]=useState('')
 const [hits,setHits]=useState<{offset:number;snippet:string}[]>([])
 const scroll=useRef<HTMLDivElement|null>(null)
 const lines=useMemo(()=>chunk.text.split('\n'),[chunk.text])
 const virtual=useVirtualizer({count:lines.length,getScrollElement:()=>scroll.current,estimateSize:()=>23,overscan:8})
 const refresh=useCallback(()=>window.toolDock.transfer.messages.list().then(setList).catch(e=>msg.error(e)),[])
 useEffect(()=>{void refresh()},[refresh,snapshot?.pool.messageCount])
 const copy=async(id:string)=>{try{await window.toolDock.transfer.messages.copy(id);msg.success('已复制全文')}catch(e){msg.error(e)}}
 const send=async()=>{if(!text.trim()||sending||!snapshot?.running)return
  setSending(true)
  try{await window.toolDock.transfer.messages.send(text);setText('');await refresh();msg.success('消息已发送到共享池')}
  catch(e){msg.error(e)}
  finally{setSending(false)}
 }
 const remove=async(ids:string[])=>{
  if(!await dialog.confirm({title:'删除消息',description:'消息删除后所有设备都无法再查看或复制关联的临时文本。',variant:'danger',confirmText:'确认删除'}))return
  try{await window.toolDock.transfer.messages.remove(ids);await refresh();msg.success('消息已删除')}catch(e){msg.error(e)}
 }
 const clear=async()=>{
  if(!await dialog.confirm({title:'清空全部消息',description:'将删除消息池全部文字及关联临时文件，不能撤销。',variant:'danger',confirmText:'确认清空'}))return
  try{await window.toolDock.transfer.messages.clear();await refresh();msg.success('消息池已清空')}catch(e){msg.error(e)}
 }
 const load=async(id:string,offset:number)=>{
  try{setChunk(await window.toolDock.transfer.messages.chunk(id,offset));setCurrentOffset(offset);if(scroll.current)scroll.current.scrollTop=0}
  catch(e){msg.error(e)}
 }
 const open=(item:PoolMessage)=>{setViewer(item);setPositions([]);setQuery('');setHits([]);void load(item.id,0)}
 const next=()=>{if(!viewer||chunk.done)return;setPositions(old=>[...old,currentOffset]);void load(viewer.id,chunk.nextOffset)}
 const previous=()=>{if(!viewer||!positions.length)return;const offset=positions.at(-1)!;setPositions(old=>old.slice(0,-1));void load(viewer.id,offset)}
 const find=async()=>{if(!viewer||!query.trim())return;try{setHits(await window.toolDock.transfer.messages.search(viewer.id,query.trim()))}catch(e){msg.error(e)}}
 const download=async(item:PoolMessage)=>{
  // Electron main process is the trusted bridge for clipboard; text files can be copied without loading them into the webview.
  await copy(item.id)
 }
 return <div className="space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><h3 className="text-sm font-semibold">文字消息池 <span className="text-xs muted">{list.total} / 300</span></h3><p className="mt-1 text-xs muted">全设备公共剪贴板；超过 2000 字符自动保存为临时 TXT，复制仍是全文。</p></div>
   <div className="flex gap-2"><Button size="sm" variant="ghost" title="刷新" onClick={()=>void refresh()}><RefreshCw size={14}/></Button><Button size="sm" variant="danger" disabled={!list.total} onClick={()=>void clear()}><Trash2 size={14}/>清空消息池</Button></div>
  </div>
  <div className="max-h-[460px] space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3">
   {!list.items.length&&<p className="py-12 text-center text-xs muted">还没有文字消息。任意设备发送后会显示在这里。</p>}
   {list.items.map(item=><div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
    <div className="mb-2 flex items-center justify-between gap-2"><span className="truncate text-[11px] font-medium muted">{item.deviceName} · {new Date(item.createdAt).toLocaleString()}</span><div className="flex shrink-0 gap-1">
      <Button size="icon" variant="ghost" aria-label="复制全文" title="复制全文" onClick={()=>void copy(item.id)}><Copy size={14}/></Button>
      <Button size="icon" variant="danger" aria-label="删除消息" title="删除消息" onClick={()=>void remove([item.id])}><Trash2 size={14}/></Button>
    </div></div>
    {item.kind==='file'?<div className="space-y-2"><p className="line-clamp-3 whitespace-pre-wrap break-all text-xs">{item.preview}...</p><div className="flex flex-wrap items-center gap-2 text-[11px] muted"><FileText size={13}/>{item.charCount.toLocaleString()} 字符 · {human(item.bytes)} · 临时 TXT</div>
     <div className="flex gap-2"><Button size="sm" onClick={()=>open(item)}><FileText size={14}/>打开查看</Button><Button size="sm" onClick={()=>void copy(item.id)}><Copy size={14}/>复制全文</Button></div>
    </div>:<p className="whitespace-pre-wrap break-all text-xs leading-6">{item.text}</p>}
   </div>)}
  </div>
  <div className="flex items-end gap-2">
   <textarea aria-label="输入共享文字消息" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void send()}}}
    placeholder="输入或粘贴任意纯文本，Ctrl + Enter 发送..." rows={3} className="min-h-[84px] min-w-0 flex-1 resize-y rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 text-xs outline-none focus:border-indigo-500"/>
   <Button variant="primary" disabled={sending||!snapshot?.running||!text.trim()} onClick={()=>void send()}><Send size={15}/>{sending?'发送中':'发送'}</Button>
  </div>
  <DialogShell open={Boolean(viewer)} onOpenChange={opened=>{if(!opened)setViewer(null)}} title="临时文本查看器" description={viewer?viewer.charCount.toLocaleString()+' 字符 · '+human(viewer.bytes):''} width="workspace"
   footer={<><Button onClick={()=>viewer&&void copy(viewer.id)}><Copy size={14}/>复制全文</Button><Button onClick={()=>viewer&&void previous()} disabled={!positions.length}><ChevronLeft size={14}/>上一段</Button><Button onClick={()=>viewer&&void next()} disabled={chunk.done}>下一段<ChevronRight size={14}/></Button><Button variant="primary" onClick={()=>setViewer(null)}>关闭</Button></>}>
   <div className="space-y-3">
    <div className="flex gap-2"><Input aria-label="搜索文本" placeholder="在完整文件中搜索..." value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void find()}}/><Button onClick={()=>void find()}><Search size={14}/>搜索</Button></div>
    {hits.length>0&&<div className="max-h-28 space-y-1 overflow-auto text-xs muted">{hits.map((hit,i)=><p key={i}>位置 {hit.offset}：{hit.snippet}</p>)}</div>}
    <div ref={scroll} className="h-[min(48vh,420px)] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] font-mono text-xs leading-6">
     <div style={{height:virtual.getTotalSize(),position:'relative'}}>{virtual.getVirtualItems().map(row=><div key={row.key} data-index={row.index} ref={virtual.measureElement} style={{position:'absolute',top:0,left:0,width:'100%',transform:'translateY('+row.start+'px)'}} className="whitespace-pre-wrap break-all px-3">{lines[row.index]||' '}</div>)}</div>
    </div>
    <p className="text-[11px] muted">按 UTF-8 字节分块加载，当前片段末尾位置 {chunk.nextOffset.toLocaleString()}；大文件不会一次性载入浏览器。</p>
   </div>
  </DialogShell>
 </div>
}
