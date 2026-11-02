import {useEffect,useMemo,useState} from 'react'
import {History,Search,Trash2} from 'lucide-react'
import {Modal} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {useDialog} from '@/components/ui/dialog-provider'
import type {ShareHistory,AddSourcesResult} from '@/shared/fileTransferModels'

export function ShareHistoryDialog({open,onClose,onRestored}:{open:boolean;onClose:()=>void;onRestored:(result:AddSourcesResult)=>void}){
 const dialogs=useDialog()
 const [rows,setRows]=useState<ShareHistory[]>([]),[search,setSearch]=useState(''),[selected,setSelected]=useState<string[]>([])
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const refresh=async()=>setRows(await window.toolDock.transfer.history.list())
 useEffect(()=>{if(open){void refresh().catch(e=>setError(String(e)))}else{setSelected([]);setSearch('');setError('')}},[open])
 const filtered=useMemo(()=>rows.filter(x=>(x.name+' '+x.path).toLocaleLowerCase().includes(search.toLocaleLowerCase())),[rows,search])
 const toggle=(id:string)=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])
 const allSelected=filtered.length>0&&filtered.every(x=>selected.includes(x.id))
 const selectAll=()=>setSelected(v=>allSelected?v.filter(id=>!filtered.some(r=>r.id===id)):[...new Set([...v,...filtered.map(r=>r.id)])])
 const remove=async(id:string)=>{await window.toolDock.transfer.history.remove(id);setSelected(v=>v.filter(x=>x!==id));await refresh()}
 const clear=async()=>{
  if(!await dialogs.confirm({title:'清空分享历史',description:'确定清空最近使用的全部分享源路径吗？这不会删除任何磁盘文件或当前分享。',variant:'danger',confirmText:'清空历史'}))return
  try{setBusy(true);await window.toolDock.transfer.history.clear();setRows([]);setSelected([])}catch(e){setError(String(e))}finally{setBusy(false)}
 }
 const restore=async()=>{
  if(!selected.length)return
  try{setBusy(true);const result=await window.toolDock.transfer.history.restore(selected);onRestored(result);onClose()}
  catch(e){setError(String(e))}finally{setBusy(false)}
 }
 return <Modal open={open} onOpenChange={v=>{if(!v)onClose()}} title="分享历史记录" width="workspace" footer={<>
  <Button onClick={onClose}>取消</Button>
  <Button variant="primary" disabled={!selected.length||busy} onClick={()=>void restore()}>添加所选 ({selected.length})</Button>
 </>}>
  <div className="space-y-3">
   <div className="flex items-center gap-2"><div className="relative min-w-0 flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-[var(--muted)]"/><Input className="pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索文件名或完整路径"/></div>
    <Button size="sm" onClick={selectAll}>{allSelected?'取消全选':'全选结果'}</Button>
    <Button size="sm" variant="danger" disabled={!rows.length||busy} onClick={()=>void clear()}><Trash2 size={14}/>清空</Button>
   </div>
   <div className="text-xs muted">最近 300 条独立路径 · 当前 {filtered.length} 条</div>
   <div className="max-h-[50vh] space-y-1 overflow-y-auto">
    {!filtered.length&&<div className="py-10 text-center text-xs muted">没有匹配的分享历史</div>}
    {filtered.map(x=><div key={x.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2">
     <input type="checkbox" aria-label={'选择 '+x.name} checked={selected.includes(x.id)} onChange={()=>toggle(x.id)}/>
     <History size={16} className="shrink-0 text-indigo-400"/>
     <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{x.kind==='directory'?'文件夹 · ':'文件 · '}{x.name}</p><p title={x.path} className="truncate text-[11px] muted">{x.path}</p><p className={'text-[10px] '+(x.available===false?'text-amber-500':'muted')}>{x.available===false?'路径不可用 · ':''}最近使用：{new Date(x.lastUsedAt).toLocaleString()}</p></div>
     <Button size="sm" variant="ghost" onClick={()=>void remove(x.id).catch(e=>setError(String(e)))} title="删除这条历史"><Trash2 size={15}/></Button>
    </div>)}
   </div>
   {error&&<p role="alert" className="text-xs text-red-400">{error}</p>}
  </div>
 </Modal>
}
