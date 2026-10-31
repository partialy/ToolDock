import {useRef,useState} from 'react'
import * as Menu from '@radix-ui/react-dropdown-menu'
import {GripVertical,MoreHorizontal} from 'lucide-react'
import {useSortable} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {Icon} from '@/components/ui/icon'
import {useMicroMotion} from '@/components/ui/motion-preference'
import type {QuickLaunchApp,QuickLaunchTask} from '@/shared/quickLaunchModels'
import {isQuickLaunchLocked} from '@/shared/quickLaunchModels'
export const statusLabels={starting:'启动中',running:'运行中',completed:'已完成',failed:'执行失败',unknown:'状态未知'}
export type CardAction='run'|'details'|'edit'|'forward'|'back'|'hide'|'copy'|'stop'
export function LaunchIcon({app,size=28}:{app:Pick<QuickLaunchApp,'iconKind'|'iconValue'|'iconDataUrl'>;size?:number}){
 return app.iconKind==='managed'&&app.iconDataUrl?<img src={app.iconDataUrl} alt="" className="h-full w-full object-contain"/>:<Icon name={app.iconValue} size={size}/>
}
export function QuickLaunchCard({app,task,trigger,disabled,sortable,onAction,canForward,canBack}:{app:QuickLaunchApp;task?:QuickLaunchTask;trigger:'single'|'double';disabled:boolean;sortable:boolean;onAction:(action:CardAction)=>void;canForward:boolean;canBack:boolean}){
 const {off,reduced}=useMicroMotion()
 const locked=!!task&&isQuickLaunchLocked(task),[menu,setMenu]=useState(false),[selected,setSelected]=useState(false)
 const target=useRef<HTMLButtonElement>(null)
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id:app.id,disabled:!sortable||locked||disabled})
 const items:[CardAction,string,boolean][]=[['run',locked?'查看当前任务':'启动',false],['details','运行详情',!task],['edit','编辑',locked],['forward','前移一位',locked||!canForward],['back','后移一位',locked||!canBack],['hide','隐藏',locked],['copy','复制命令',false],['stop','停止任务',!task||!['running','starting'].includes(task.status)]]
 return <article ref={setNodeRef} style={{transform:CSS.Transform.toString(transform),transition:off||reduced?'none':transition}} className={'relative min-w-0 rounded-xl border bg-[var(--panel)] p-3 '+(selected?'border-[var(--primary)]':'border-[var(--border)]')+(isDragging?' z-20 opacity-60':'')} onContextMenu={e=>{e.preventDefault();setMenu(true)}}>
  <div className="mb-2 flex items-center justify-between gap-1"><button ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={!sortable||locked||disabled} aria-label={'拖动排序 '+app.name} title="拖动；空格开始后使用方向键排序" className="rounded p-1 text-[var(--muted)] disabled:opacity-25" style={{touchAction:'none'}}><GripVertical size={14}/></button>
   {task&&<span className={'rounded px-1.5 py-0.5 text-[10px] '+(['failed','unknown'].includes(task.status)?'bg-amber-500/15 text-amber-500':locked?'bg-emerald-500/15 text-emerald-500':'bg-[var(--panel-alt)] muted')}>{statusLabels[task.status]}</span>}
   <Menu.Root open={menu} onOpenChange={setMenu}><Menu.Trigger asChild><button aria-label={app.name+'操作菜单'} className="rounded p-1 hover:bg-[var(--hover)]"><MoreHorizontal size={16}/></button></Menu.Trigger><Menu.Portal><Menu.Content collisionPadding={12} className="z-[350] min-w-40 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-xl">{items.map(([key,label,off])=><Menu.Item key={key} disabled={disabled||off} onSelect={()=>onAction(key)} className="cursor-pointer rounded-lg px-3 py-2 text-xs outline-none data-[highlighted]:bg-[var(--hover)] data-[disabled]:opacity-35">{label}</Menu.Item>)}</Menu.Content></Menu.Portal></Menu.Root>
  </div>
  <button ref={target} disabled={disabled} title={app.description||app.name} onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();setMenu(true)}if(trigger==='double'&&e.key==='Enter'){e.preventDefault();onAction('run')}}} onClick={e=>{setSelected(true);if(trigger==='single'&&e.detail<2)onAction('run')}} onDoubleClick={()=>{if(trigger==='double')onAction('run')}} className="flex w-full flex-col items-center gap-3 rounded-lg px-1 py-2 outline-offset-4 disabled:opacity-50">
   <span className="flex aspect-square w-16 items-center justify-center overflow-hidden rounded-2xl bg-[var(--selected)] p-3 text-[var(--primary)]"><LaunchIcon app={app}/></span><strong className="w-full truncate text-center text-sm">{app.name}</strong><span className="text-[10px] muted">{app.shell==='cmd'?'CMD':app.psFlavor==='pwsh'?'PowerShell 7':'PowerShell'}{app.runAsAdmin?' · 管理员':''}</span>
  </button>
 </article>
}
