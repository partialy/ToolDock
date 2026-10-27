import {useSortable} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {GripVertical,Copy,Trash2,Play} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {SwitchField} from '@/components/ui/switch-field'
import {CodecStepOptions} from './CodecStepOptions'
import {kindLabels,type CodecStep} from '@/shared/codecModels'
import type {Stage} from '@/lib/codec/execute'
export function CodecStepCard({step,index,stage,selected,onSelect,onChange,onCopy,onRemove,onPreview}:{step:CodecStep;index:number;stage?:Stage;selected:boolean;onSelect:()=>void;onChange:(s:CodecStep)=>void;onCopy:()=>void;onRemove:()=>void;onPreview:()=>void}){
 const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:step.id})
 return <div ref={setNodeRef} style={{transform:CSS.Transform.toString(transform),transition,zIndex:isDragging?5:undefined}} className={'rounded-xl border p-3 space-y-2 bg-[var(--panel)] '+(selected?'border-indigo-500':'border-[var(--border)]')}>
  <div className="flex items-center gap-2">
   <button type="button" aria-label="拖动步骤" className="cursor-grab touch-none" {...attributes} {...listeners}><GripVertical size={15}/></button>
   <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left text-xs font-medium">{index+1}. {kindLabels[step.kind]} · {step.direction==='encode'?'编码':'解码'}</button>
   <SwitchField ariaLabel="启用步骤" checked={step.enabled} onCheckedChange={v=>onChange({...step,enabled:v})}/>
   <Button variant="ghost" size="icon" title="只预览此步骤" onClick={onPreview}><Play size={14}/></Button>
   <Button variant="ghost" size="icon" title="复制步骤" onClick={onCopy}><Copy size={14}/></Button>
   <Button variant="ghost" size="icon" title="删除步骤" onClick={onRemove}><Trash2 size={14}/></Button>
  </div>
  <CodecStepOptions step={step} onChange={onChange} compact/>
  {stage&&<div className={'text-xs '+(stage.status==='error'?'text-red-400':'muted')} role={stage.status==='error'?'alert':undefined}>
   {stage.status==='ok'?'已完成':stage.status==='error'?'失败':stage.status==='skipped'?'已禁用':'未执行'} · {stage.inputBytes.toLocaleString()} → {stage.outputBytes.toLocaleString()} B · {stage.durationMs.toFixed(1)} ms
   {stage.error&&<div>{stage.error}</div>}
  </div>}
 </div>
}
