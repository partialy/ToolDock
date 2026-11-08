import {useCallback,useEffect,useMemo,useState} from 'react'
import {ChevronRight,Download,File,Folder,FolderPlus,Plus,RefreshCw,Search,Trash2,Save,CheckSquare} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {SelectField} from '@/components/ui/select-field'
import {useDialog} from '@/components/ui/dialog-provider'
import {msg} from '@/components/ui/message'
import type {PoolItem,PoolPage,TransferSnapshot,AddSourcesResult} from '@/shared/fileTransferModels'

const human=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GiB':n>=1024**2?(n/1024**2).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':n+' B'
const empty:PoolPage={parentId:null,items:[],nextCursor:null,total:0,usedBytes:0,itemCount:0}
export function TransferPoolTab({snapshot,revision}:{snapshot:TransferSnapshot|null;revision:number}){
 const dialog=useDialog()
 const [search,setSearch]=useState('')
 const [sort,setSort]=useState<'newest'|'oldest'|'name'|'size'>('newest')
 const [trail,setTrail]=useState<{id:string;name:string}[]>([])
 const [data,setData]=useState<PoolPage>(empty)
 const [checked,setChecked]=useState<string[]>([])
 const [busy,setBusy]=useState(false)
 const [loading,setLoading]=useState(false)
 const parent=trail.at(-1)?.id||null
 const refresh=useCallback(async()=>{
  const response=await window.toolDock.transfer.pool.list(parent,0,search,sort)
  setData(response)
  setChecked(old=>old.filter(id=>response.items.some(item=>item.id===id)))
 },[parent,search,sort])
 useEffect(()=>{
  let stale=false
  const timeout=setTimeout(()=>{
   setLoading(true)
   void window.toolDock.transfer.pool.list(parent,0,search,sort).then(page=>{if(!stale){setData(page);setChecked(old=>old.filter(id=>page.items.some(item=>item.id===id)))}}).catch(e=>{if(!stale)msg.error(e)}).finally(()=>{if(!stale)setLoading(false)})
  },search?180:50)
  return()=>{stale=true;clearTimeout(timeout)}
 },[parent,search,sort,revision,snapshot?.pool.fileCount])
 const perform=async(work:()=>Promise<unknown>,success:string)=>{
  setBusy(true)
  try{await work();await refresh();msg.success(success)}
  catch(e){msg.error(e)}
  finally{setBusy(false)}
 }
 const added=(value:AddSourcesResult)=>{
  if(value.errors.length)msg.warning(value.errors.join('\n'))
  msg.success('已添加 '+value.added+' 个文件，跳过 '+value.skipped+' 项')
 }
 const pick=(folder=false)=>void perform(async()=>{added(await (folder?window.toolDock.transfer.pool.pickFolder():window.toolDock.transfer.pool.pick()))},'文件池已更新')
 const selected=useMemo(()=>new Set(checked),[checked])
 const toggle=(id:string)=>setChecked(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id])
 const save=(ids:string[])=>void perform(async()=>{
  const result=await window.toolDock.transfer.pool.save(ids)
  if(result.cancelled)throw Error('已取消保存')
 },'文件已保存到指定位置')
 const remove=async(ids:string[])=>{
  if(!ids.length)return
  const okay=await dialog.confirm({title:'从文件池删除',description:'即将删除 '+ids.length+' 项及其子文件。此操作只删除文件池临时副本，不影响主设备源文件。正在下载的任务会中断。',variant:'danger',confirmText:'删除临时文件'})
  if(!okay)return
  await perform(()=>window.toolDock.transfer.pool.remove(ids),'已从文件池移除')
  setChecked([])
 }
 const clear=async()=>{
  const yes=await dialog.confirm({title:'清空整个文件池',description:'这会取消进行中的上传与下载，并删除文件池内所有临时文件和目录。不会影响主设备原始文件和已另存的副本。',variant:'danger',confirmText:'确认清空'})
  if(yes)await perform(()=>window.toolDock.transfer.pool.clear(),'文件池已清空')
 }
 const all=data.items.length>0&&data.items.every(item=>selected.has(item.id))
 const loadMore=async()=>{
  if(!data.nextCursor)return
  try{const next=await window.toolDock.transfer.pool.list(parent,Number(data.nextCursor),search,sort);setData(old=>({...next,items:[...old.items,...next.items]}))}
  catch(e){msg.error(e)}
 }
 const selectAll=()=>setChecked(all?[]:data.items.map(x=>x.id))
 const openFolder=(item:PoolItem)=>{setTrail(old=>[...old,{id:item.id,name:item.name}]);setSearch('');setChecked([])}
 return <div className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><h3 className="text-sm font-semibold">共享文件池 <span className="ml-1 text-xs muted">{data.total} 项</span></h3><p className="mt-1 text-xs muted">所有授权设备均可上传和下载，文件暂存于主设备；关闭服务后自动清理。</p></div>
   <div className="flex flex-wrap gap-2">
    <Button size="sm" disabled={busy||!snapshot?.running} onClick={()=>pick(true)}><FolderPlus size={14}/>添加文件夹</Button>
    <Button size="sm" variant="primary" disabled={busy||!snapshot?.running} onClick={()=>pick()}><Plus size={14}/>添加文件</Button>
    <Button size="sm" variant="danger" disabled={busy||!snapshot?.running||!snapshot?.pool.fileCount} onClick={()=>void clear()}><Trash2 size={14}/>清空文件池</Button>
   </div>
  </div>
  <div className="flex flex-wrap items-center gap-2">
   <div className="relative min-w-[190px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-[var(--muted)]"/><Input aria-label="搜索文件池" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索文件、设备、上传时间..." className="pl-9"/></div>
   <SelectField ariaLabel="文件池排序" value={sort} onValueChange={v=>setSort(v as typeof sort)} options={[{value:'newest',label:'最新上传'},{value:'oldest',label:'最早上传'},{value:'name',label:'按文件名'},{value:'size',label:'按大小'}]}/>
   <Button variant="ghost" size="icon" aria-label="刷新" title="刷新" onClick={()=>void refresh()}><RefreshCw size={16}/></Button>
  </div>
  <nav className="flex min-h-8 flex-wrap items-center gap-1 text-xs" aria-label="文件池路径">
   <button onClick={()=>{setTrail([]);setChecked([])}} className="rounded px-2 py-1 text-indigo-400 hover:bg-[var(--hover)]">文件池</button>
   {trail.map((part,i)=><span key={part.id} className="inline-flex items-center gap-1"><ChevronRight size={12} className="muted"/><button className="rounded px-1 py-1 hover:bg-[var(--hover)]" onClick={()=>{setTrail(old=>old.slice(0,i+1));setChecked([])}}>{part.name}</button></span>)}
  </nav>
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
   <label className="flex items-center gap-2 text-xs muted"><input type="checkbox" checked={all} onChange={selectAll} disabled={!data.items.length}/>全选当前页 <span>已选 {checked.length} 项</span></label>
   <div className="flex gap-2">
    <Button size="sm" disabled={!checked.length||busy} onClick={()=>save(checked)}><Save size={14}/>批量保存</Button>
    <Button size="sm" variant="danger" disabled={!checked.length||busy} onClick={()=>void remove(checked)}><Trash2 size={14}/>删除所选</Button>
   </div>
  </div>
  {loading&&!data.items.length&&<p className="py-8 text-center text-xs muted">正在加载文件池...</p>}
  {!loading&&!data.items.length&&<div className="py-14 text-center text-xs muted"><Folder size={32} className="mx-auto mb-3 opacity-50"/>{search?'未找到匹配的文件':'文件池还是空的，可以从主设备添加文件，也可以让手机上传。'}</div>}
  <div className="divide-y divide-[var(--border)]">
   {data.items.map(item=><div key={item.id} className="flex min-w-0 items-center gap-3 py-3">
    <input type="checkbox" checked={selected.has(item.id)} onChange={()=>toggle(item.id)} aria-label={'选择 '+item.name}/>
    <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={()=>item.kind==='directory'&&openFolder(item)}>
     <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/10 text-indigo-400">{item.kind==='directory'?<Folder size={19}/>:<File size={19}/>}</span>
     <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold" title={item.name}>{item.name}</span><span className="mt-1 block truncate text-[11px] muted">{item.kind==='directory'?'文件夹':human(item.size)} · {item.deviceName} · {new Date(item.createdAt).toLocaleString()}</span></span>
     {item.kind==='directory'&&<ChevronRight size={14} className="muted"/>}
    </button>
    <Button size="icon" variant="ghost" title="保存到电脑" aria-label={'保存 '+item.name} disabled={busy} onClick={()=>save([item.id])}><Download size={16}/></Button>
    <Button size="icon" variant="danger" title="从文件池移除" aria-label={'移除 '+item.name} disabled={busy} onClick={()=>void remove([item.id])}><Trash2 size={16}/></Button>
   </div>)}
  </div>
  {data.nextCursor&&<div className="flex justify-center"><Button size="sm" onClick={()=>void loadMore()}>加载更多（{data.items.length}/{data.total}）</Button></div>}
 </div>
}
