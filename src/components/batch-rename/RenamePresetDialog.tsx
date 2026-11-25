import {useState} from 'react'
import {Copy,FolderOpen,RotateCw,Save,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {DialogShell} from '@/components/ui/dialog-shell'
import type {RenamePresetSaved,RenamePresetSummary} from '@/shared/batchRenameModels'

export interface RenamePresetDialogProps{
 open:boolean
 onClose:()=>void
 presets:RenamePresetSummary[]
 currentPreset:RenamePresetSaved|null
 draftName:string
 draftDescription:string
 onDraftMetaChange:(name:string,description:string)=>void
 onSave:(asNew:boolean)=>Promise<void>
 onLoad:(id:string)=>Promise<void>
 onDuplicate:(item:RenamePresetSummary)=>Promise<void>
 onRemove:(item:RenamePresetSummary)=>Promise<void>
 onRefresh:()=>Promise<void>
}

export function RenamePresetDialog({
 open,
 onClose,
 presets,
 currentPreset,
 draftName,
 draftDescription,
 onDraftMetaChange,
 onSave,
 onLoad,
 onDuplicate,
 onRemove,
 onRefresh
}:RenamePresetDialogProps){
 const [search,setSearch]=useState('')
 const filtered=presets.filter(p=>(p.name+' '+p.description).toLowerCase().includes(search.trim().toLowerCase()))

 return (
  <DialogShell open={open} onOpenChange={v=>{if(!v)onClose()}} title="重命名规则预设库" width="workspace">
   <div className="space-y-4">
    <div className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-semibold">保存当前规则流水线</span>
      {currentPreset&&<span className="text-[11px] muted">当前关联：{currentPreset.name} (v{currentPreset.revision})</span>}
     </div>
     <div className="grid gap-2 sm:grid-cols-2">
      <Input aria-label="预设名称" placeholder="预设名称（必填）" maxLength={80} value={draftName} onChange={e=>onDraftMetaChange(e.target.value,draftDescription)} className="h-9 text-xs"/>
      <Input aria-label="预设说明" placeholder="可选备注说明" maxLength={500} value={draftDescription} onChange={e=>onDraftMetaChange(draftName,e.target.value)} className="h-9 text-xs"/>
     </div>
     <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="primary" onClick={()=>void onSave(false)}><Save size={14}/> {currentPreset?'保存修改':'保存新预设'}</Button>
      {currentPreset&&<Button size="sm" onClick={()=>void onSave(true)}>另存为新预设</Button>}
     </div>
    </div>

    <div className="flex flex-wrap items-center gap-2">
     <div className="flex items-center gap-2 text-xs font-semibold"><FolderOpen size={15}/> 已保存预设 <span className="font-normal muted">{presets.length} / 200</span></div>
     <Input aria-label="搜索预设" placeholder="搜索名称或备注" value={search} onChange={e=>setSearch(e.target.value)} className="ml-auto h-8 max-w-xs text-xs"/>
     <Button size="sm" variant="ghost" onClick={()=>void onRefresh()}><RotateCw size={14}/> 刷新</Button>
    </div>

    <div className="grid max-h-[min(45vh,420px)] gap-2 overflow-y-auto md:grid-cols-2">
     {filtered.length?filtered.map(item=>(
      <div key={item.id} className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3">
       <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
         <div className="truncate text-xs font-semibold" title={item.name}>{item.name}</div>
         <div className="mt-0.5 truncate text-[11px] muted">{item.description||'无描述'} · {item.stepCount} 步</div>
        </div>
        <span className="shrink-0 text-[10px] muted">{new Date(item.updatedAt).toLocaleDateString()}</span>
       </div>
       <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" onClick={()=>void onLoad(item.id)}>载入</Button>
        <Button size="sm" onClick={()=>void onDuplicate(item)}><Copy size={13}/> 复制</Button>
        <Button size="sm" variant="danger" onClick={()=>void onRemove(item)}><Trash2 size={13}/> 删除</Button>
       </div>
      </div>
     )):<p className="col-span-full py-8 text-center text-xs muted">{presets.length?'没有匹配的预设':'暂未保存任何重命名预设'}</p>}
    </div>
   </div>
  </DialogShell>
 )
}
