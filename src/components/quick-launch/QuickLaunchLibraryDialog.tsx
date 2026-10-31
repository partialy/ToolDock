import {useState} from 'react'
import {Eye,EyeOff,FolderCog,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {SelectField} from '@/components/ui/select-field'
import {DialogShell} from '@/components/ui/dialog-shell'
import {LaunchIcon} from './QuickLaunchCard'
import type {QuickLaunchApp,QuickLaunchGroup} from '@/shared/quickLaunchModels'
export function QuickLaunchLibraryDialog({apps,groups,lockedIds,busy,error,onClose,onEdit,onVisible,onDelete,onGroups}:{apps:QuickLaunchApp[];groups:QuickLaunchGroup[];lockedIds:Set<string>;busy:boolean;error:string;onClose:()=>void;onEdit:(app:QuickLaunchApp)=>void;onVisible:(app:QuickLaunchApp)=>void;onDelete:(app:QuickLaunchApp)=>void;onGroups:()=>void}){
 const [search,setSearch]=useState(''),[visible,setVisible]=useState('all')
 const query=search.trim().toLowerCase(),items=apps.filter(a=>(visible==='all'||a.visible===(visible==='visible'))&&(!query||(a.name+' '+a.description).toLowerCase().includes(query)))
 return <DialogShell open title="App 库" description="管理全部 App，包括主页面已隐藏的项目。恢复显示会保留原排序槽位。" width="workspace" onOpenChange={v=>{if(!v)onClose()}}>
  <div className="mb-4 flex flex-wrap gap-2"><Input className="min-w-40 flex-1" aria-label="搜索 App 库" placeholder="搜索名称或描述" value={search} onChange={e=>setSearch(e.target.value)}/><SelectField ariaLabel="显示状态" value={visible} onValueChange={setVisible} options={[{value:'all',label:'全部 App'},{value:'visible',label:'已显示'},{value:'hidden',label:'已隐藏'}]}/><Button onClick={onGroups}><FolderCog size={16}/> 分组管理</Button></div>
  <div className="space-y-2">{items.map(a=><div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] p-3"><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[var(--selected)] p-2 text-[var(--primary)]"><LaunchIcon app={a} size={24}/></span><div className="min-w-32 flex-1"><p className="truncate text-sm font-semibold" title={a.name}>{a.name}{lockedIds.has(a.id)&&<span className="ml-2 text-[10px] text-amber-500">运行锁定</span>}</p><p className="mt-1 truncate text-xs muted" title={a.description}>{groups.find(g=>g.id===a.groupId)?.name} · {a.shell==='cmd'?'CMD':'PowerShell'} · {a.visible?'已显示':'已隐藏'}</p></div><Button size="sm" disabled={busy||lockedIds.has(a.id)} onClick={()=>onEdit(a)}>编辑</Button><Button size="sm" disabled={busy||lockedIds.has(a.id)} onClick={()=>onVisible(a)}>{a.visible?<EyeOff size={14}/>:<Eye size={14}/>} {a.visible?'隐藏':'恢复'}</Button><Button variant="danger" size="icon" aria-label={'删除 '+a.name} disabled={busy||lockedIds.has(a.id)} onClick={()=>onDelete(a)}><Trash2 size={15}/></Button></div>)}</div>{!items.length&&<p className="py-12 text-center text-sm muted">没有匹配的 App</p>}
 {error&&<p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}</DialogShell>
}
