import * as Menu from '@radix-ui/react-dropdown-menu'
import {Ellipsis,FilePenLine,Download,Eye,Play,RefreshCw,RotateCcw,Square,Trash2,FileCode2} from 'lucide-react'
import type {ConversionTask} from '@/shared/textConversionModels'

export type RowAction='convert'|'reconvert'|'preview'|'rename'|'encoding'|'save'|'cancel'|'remove'
export function TextConversionRowMenu({task,onAction}:{task:ConversionTask;onAction:(action:RowAction)=>void}){
 const running=['queued','running'].includes(task.state)
 const actions:{id:RowAction;label:string;icon:typeof Play;disabled?:boolean}[]=[
  ...(running?[]:task.state==='completed'?[{id:'reconvert' as const,label:'重新转换',icon:RefreshCw}]:[{id:'convert' as const,label:'开始转换',icon:Play}]),
  {id:'preview',label:'预览原文 / 结果',icon:Eye,disabled:task.state!=='completed'},
  {id:'rename',label:'修改输出文件名',icon:FilePenLine,disabled:running},
  {id:'encoding',label:'设置输入编码',icon:FileCode2,disabled:running},
  {id:'save',label:'保存文件',icon:Download,disabled:task.state!=='completed'},
  ...(running?[{id:'cancel' as const,label:'取消任务',icon:Square}]:[]),
  {id:'remove',label:'移除任务',icon:Trash2}
 ]
 return <Menu.Root>
  <Menu.Trigger asChild><button title={'操作 · '+task.name} aria-label={'操作 · '+task.name} className="shrink-0 rounded-lg p-2 text-[var(--muted)] transition-colors hover:bg-[var(--hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"><Ellipsis size={18}/></button></Menu.Trigger>
  <Menu.Portal><Menu.Content sideOffset={6} align="end" className="z-[350] min-w-44 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-2xl">
   {actions.map((action,index)=><Menu.Item key={action.id} disabled={action.disabled} onSelect={()=>onAction(action.id)} className={'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-35 data-[highlighted]:bg-[var(--hover)] '+(action.id==='remove'?'text-red-400':'text-[var(--foreground)]')}>
    <action.icon size={15}/>{action.label}
   </Menu.Item>)}
  </Menu.Content></Menu.Portal>
 </Menu.Root>
}
