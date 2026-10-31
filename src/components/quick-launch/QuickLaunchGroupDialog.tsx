import {useState} from 'react'
import {ArrowDown,ArrowUp,Plus,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {DialogShell} from '@/components/ui/dialog-shell'
import {useDialog} from '@/components/ui/dialog-provider'
import type {QuickLaunchApp,QuickLaunchGroup} from '@/shared/quickLaunchModels'
export function QuickLaunchGroupDialog({groups,apps,lockedIds,error,onClose,onAction}:{groups:QuickLaunchGroup[];apps:QuickLaunchApp[];lockedIds:Set<string>;error:string;onClose:()=>void;onAction:(key:string,fn:()=>Promise<unknown>)=>Promise<unknown>}){
 const dialog=useDialog(),[name,setName]=useState(''),[names,setNames]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false)
 const api=window.toolDock.quickLaunch
 const act=async(key:string,fn:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);try{await onAction(key,fn)}finally{setBusy(false)}}
 const groupLocked=(id:string)=>apps.some(a=>a.groupId===id&&lockedIds.has(a.id))
 const canMove=(index:number,delta:number)=>!!groups[index+delta]&&!groupLocked(groups[index].id)&&!groupLocked(groups[index+delta].id)
 const move=(index:number,delta:number)=>{const ids=groups.map(g=>g.id),target=index+delta;if(!canMove(index,delta))return;[ids[index],ids[target]]=[ids[target],ids[index]];void act('groups',()=>api.reorderGroups(ids))}
 return <DialogShell open title="分组管理" description="删除分组会将其中 App 移入未分组；包含运行中或状态未知 App 的分组不可删除。" onOpenChange={v=>{if(!v&&!busy)onClose()}} width="lg" dismissible={!busy}>
  <div className="mb-4 flex gap-2"><Input aria-label="新分组名称" placeholder="新分组名称" maxLength={60} value={name} onChange={e=>setName(e.target.value)}/><Button disabled={busy||!name.trim()} onClick={()=>void act('group:create',async()=>{await api.saveGroup(name);setName('')})}><Plus size={15}/> 新建</Button></div>
  <div className="space-y-2">{groups.map((g,i)=>{const locked=apps.some(a=>a.groupId===g.id&&lockedIds.has(a.id));return <div key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] p-3"><Input aria-label={'分组名称 '+g.name} maxLength={60} className="min-w-32 flex-1" value={names[g.id]??g.name} disabled={busy||locked} onChange={e=>setNames(v=>({...v,[g.id]:e.target.value}))}/><Button size="sm" disabled={busy||locked||!(names[g.id]?.trim())||names[g.id]===g.name} onClick={()=>void act('group:'+g.id,()=>api.saveGroup(names[g.id],g.id))}>保存</Button><Button size="icon" aria-label={'上移分组 '+g.name} disabled={busy||!canMove(i,-1)} onClick={()=>move(i,-1)}><ArrowUp size={15}/></Button><Button size="icon" aria-label={'下移分组 '+g.name} disabled={busy||!canMove(i,1)} onClick={()=>move(i,1)}><ArrowDown size={15}/></Button><Button size="icon" variant="danger" title={locked?'分组包含锁定 App':g.id==='ungrouped'?'默认分组不可删除':'删除分组'} aria-label={'删除分组 '+g.name} disabled={busy||locked||g.id==='ungrouped'} onClick={()=>void act('group:'+g.id,async()=>{if(await dialog.confirm({title:'删除分组？',description:`删除“${g.name}”后，其 App 将移入未分组。`,variant:'danger',confirmText:'删除分组'}))await api.removeGroup(g.id)})}><Trash2 size={15}/></Button></div>})}</div>
 {error&&<p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}</DialogShell>
}
