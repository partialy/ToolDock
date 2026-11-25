import {useSortable} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {ArrowDown,ArrowUp,Copy,GripVertical,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {SelectField} from '@/components/ui/select-field'
import {SwitchField} from '@/components/ui/switch-field'
import {
 renameKindLabels,
 type AffixTrimStepOptions,
 type NormalizeStepOptions,
 type RenameStep,
 type ReplaceStepOptions,
 type TemplateStepOptions
} from '@/shared/batchRenameModels'

const TEMPLATE_TOKENS=['{name}','{number}','{date}','{parent}'] as const

export interface RenameStepCardProps{
 step:RenameStep
 index:number
 total:number
 error?:string
 onChange:(next:RenameStep)=>void
 onMove:(direction:-1|1)=>void
 onDuplicate:()=>void
 onRemove:()=>void
}

export function RenameStepCard({
 step,
 index,
 total,
 error,
 onChange,
 onMove,
 onDuplicate,
 onRemove
}:RenameStepCardProps){
 const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:step.id})

 const patchOptions=<T extends RenameStep['options']>(patch:Partial<T>)=>{
  onChange({...step,options:{...step.options,...patch}})
 }

 return (
  <div
   ref={setNodeRef}
   style={{transform:CSS.Transform.toString(transform),transition,zIndex:isDragging?10:undefined}}
   className={'space-y-3 rounded-xl border p-3 '+(error?'border-red-500/45 bg-[var(--panel)]':'border-[var(--border)] bg-[var(--panel)]')+(step.enabled?'':' opacity-70')}
  >
   <div className="flex items-center gap-1.5">
    <button type="button" aria-label="拖拽排序步骤" className="cursor-grab touch-none p-1 muted hover:text-[var(--foreground)]" {...attributes} {...listeners}>
     <GripVertical size={15}/>
    </button>
    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{index+1}. {renameKindLabels[step.kind]}</span>
    <SwitchField ariaLabel="启用此规则步骤" checked={step.enabled} onCheckedChange={enabled=>onChange({...step,enabled})}/>
    <Button variant="ghost" size="icon" disabled={index===0} title="上移" onClick={()=>onMove(-1)}><ArrowUp size={13}/></Button>
    <Button variant="ghost" size="icon" disabled={index===total-1} title="下移" onClick={()=>onMove(1)}><ArrowDown size={13}/></Button>
    <Button variant="ghost" size="icon" title="复制步骤" onClick={onDuplicate}><Copy size={13}/></Button>
    <Button variant="ghost" size="icon" title="删除步骤" onClick={onRemove}><Trash2 size={13}/></Button>
   </div>

   {step.kind==='template'&&(()=>{
    const opt=step.options as TemplateStepOptions
    return (
     <div className="space-y-2.5 text-xs">
      <div className="space-y-1">
       <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="muted">命名模板</span>
        <div className="flex flex-wrap gap-1">
         {TEMPLATE_TOKENS.map(tok=>(
          <button
           key={tok}
           type="button"
           onClick={()=>patchOptions<TemplateStepOptions>({template:opt.template+tok})}
           className="rounded border border-[var(--border)] bg-[var(--panel-alt)] px-1.5 py-0.5 font-mono text-[10px] hover:border-[var(--primary)]/50"
          >
           +{tok}
          </button>
         ))}
        </div>
       </div>
       <Input
        aria-label="命名模板"
        value={opt.template}
        placeholder="例如 {name}_{number} 或 file({number})"
        onChange={e=>patchOptions<TemplateStepOptions>({template:e.target.value})}
        className="h-9 text-xs font-mono"
       />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
       <label className="space-y-1 muted">
        <span>起始号</span>
        <Input type="number" min={0} max={999999} value={opt.startNumber} onChange={e=>patchOptions<TemplateStepOptions>({startNumber:Math.max(0,Math.trunc(Number(e.target.value)||0))})} className="h-8 text-xs"/>
       </label>
       <label className="space-y-1 muted">
        <span>步长</span>
        <Input type="number" min={1} max={10000} value={opt.step} onChange={e=>patchOptions<TemplateStepOptions>({step:Math.max(1,Math.trunc(Number(e.target.value)||1))})} className="h-8 text-xs"/>
       </label>
       <label className="space-y-1 muted">
        <span>补零位数</span>
        <Input type="number" min={1} max={12} value={opt.padWidth} onChange={e=>patchOptions<TemplateStepOptions>({padWidth:Math.min(12,Math.max(1,Math.trunc(Number(e.target.value)||1)))})} className="h-8 text-xs"/>
       </label>
       <div className="space-y-1 muted">
        <span>日期格式</span>
        <SelectField
         ariaLabel="日期占位符格式"
         value={opt.dateFormat}
         onValueChange={v=>patchOptions<TemplateStepOptions>({dateFormat:v as TemplateStepOptions['dateFormat']})}
         options={[{value:'YYYYMMDD',label:'YYYYMMDD'},{value:'YYYY-MM-DD',label:'YYYY-MM-DD'}]}
         className="h-8 min-w-0 w-full text-xs"
        />
       </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-alt)]/60 p-2">
       <div className="min-w-0">
        <div className="font-medium">首项跳过序号</div>
        <div className="text-[11px] muted">实现如 file、file(1)、file(2) 效果</div>
       </div>
       <SwitchField ariaLabel="首项跳过序号" checked={opt.skipFirstNumber} onCheckedChange={skipFirstNumber=>patchOptions<TemplateStepOptions>({skipFirstNumber})}/>
      </div>

      {opt.skipFirstNumber&&(
       <label className="block space-y-1 muted">
        <span>首项模板</span>
        <Input
         aria-label="首项模板"
         value={opt.firstTemplate}
         placeholder="例如 file 或 {name}"
         onChange={e=>patchOptions<TemplateStepOptions>({firstTemplate:e.target.value})}
         className="h-8 text-xs font-mono"
        />
       </label>
      )}
     </div>
    )
   })()}

   {step.kind==='replace'&&(()=>{
    const opt=step.options as ReplaceStepOptions
    return (
     <div className="space-y-2.5 text-xs">
      <div className="grid gap-2 sm:grid-cols-2">
       <label className="space-y-1 muted">
        <span>查找内容</span>
        <Input aria-label="查找内容" value={opt.search} placeholder="例如 ori_" onChange={e=>patchOptions<ReplaceStepOptions>({search:e.target.value})} className="h-9 text-xs font-mono"/>
       </label>
       <label className="space-y-1 muted">
        <span>替换为（留空即删除）</span>
        <Input aria-label="替换为" value={opt.replaceWith} placeholder="留空表示移除匹配内容" onChange={e=>patchOptions<ReplaceStepOptions>({replaceWith:e.target.value})} className="h-9 text-xs font-mono"/>
       </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
       <label className="flex items-center gap-2 muted"><SwitchField ariaLabel="正则表达式" checked={opt.useRegex} onCheckedChange={useRegex=>patchOptions<ReplaceStepOptions>({useRegex})}/> 正则匹配</label>
       <label className="flex items-center gap-2 muted"><SwitchField ariaLabel="区分大小写" checked={opt.caseSensitive} onCheckedChange={caseSensitive=>patchOptions<ReplaceStepOptions>({caseSensitive})}/> 区分大小写</label>
       <label className="flex items-center gap-2 muted"><SwitchField ariaLabel="替换全部" checked={opt.replaceAll} onCheckedChange={replaceAll=>patchOptions<ReplaceStepOptions>({replaceAll})}/> 替换全部</label>
      </div>
     </div>
    )
   })()}

   {step.kind==='affix-trim'&&(()=>{
    const opt=step.options as AffixTrimStepOptions
    return (
     <div className="grid gap-2 text-xs sm:grid-cols-2">
      <label className="space-y-1 muted"><span>添加前缀</span><Input aria-label="添加前缀" value={opt.prefix} placeholder="开头插入文本" onChange={e=>patchOptions<AffixTrimStepOptions>({prefix:e.target.value})} className="h-8 text-xs"/></label>
      <label className="space-y-1 muted"><span>添加后缀</span><Input aria-label="添加后缀" value={opt.suffix} placeholder="末尾追加文本" onChange={e=>patchOptions<AffixTrimStepOptions>({suffix:e.target.value})} className="h-8 text-xs"/></label>
      <label className="space-y-1 muted"><span>删除开头字符数</span><Input type="number" min={0} max={200} value={opt.trimStart} onChange={e=>patchOptions<AffixTrimStepOptions>({trimStart:Math.max(0,Math.trunc(Number(e.target.value)||0))})} className="h-8 text-xs"/></label>
      <label className="space-y-1 muted"><span>删除末尾字符数</span><Input type="number" min={0} max={200} value={opt.trimEnd} onChange={e=>patchOptions<AffixTrimStepOptions>({trimEnd:Math.max(0,Math.trunc(Number(e.target.value)||0))})} className="h-8 text-xs"/></label>
     </div>
    )
   })()}

   {step.kind==='normalize'&&(()=>{
    const opt=step.options as NormalizeStepOptions
    return (
     <div className="space-y-2.5 text-xs">
      <div className="space-y-1 muted">
       <span>字母大小写</span>
       <SelectField
        ariaLabel="字母大小写"
        value={opt.caseMode}
        onValueChange={v=>patchOptions<NormalizeStepOptions>({caseMode:v as NormalizeStepOptions['caseMode']})}
        options={[
         {value:'none',label:'保持原大小写'},
         {value:'lower',label:'全部小写'},
         {value:'upper',label:'全部大写'},
         {value:'title',label:'单词首字母大写'}
        ]}
        className="h-8 w-full text-xs"
       />
      </div>
      <div className="flex flex-wrap items-center gap-4">
       <label className="flex items-center gap-2 muted"><SwitchField ariaLabel="去首尾空白" checked={opt.trimWhitespace} onCheckedChange={trimWhitespace=>patchOptions<NormalizeStepOptions>({trimWhitespace})}/> 去首尾空白</label>
       <label className="flex items-center gap-2 muted"><SwitchField ariaLabel="合并连续空格" checked={opt.collapseSpaces} onCheckedChange={collapseSpaces=>patchOptions<NormalizeStepOptions>({collapseSpaces})}/> 合并连续空格</label>
       <label className="flex items-center gap-2 muted"><SwitchField ariaLabel="剥离末尾旧序号" checked={opt.stripTrailingIndex} onCheckedChange={stripTrailingIndex=>patchOptions<NormalizeStepOptions>({stripTrailingIndex})}/> 清理旧后缀序号</label>
      </div>
     </div>
    )
   })()}

   {error&&<p role="alert" className="text-[11px] text-red-400">{error}</p>}
  </div>
 )
}
