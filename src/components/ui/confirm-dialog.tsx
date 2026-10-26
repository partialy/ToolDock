import type {ReactNode} from 'react'
import {DialogShell} from './dialog-shell'
import {Button} from './button'
export function ConfirmDialog({open,onCancel,onConfirm,title,description,variant='confirm',busy=false,children}:{
 open:boolean;onCancel:()=>void;onConfirm:()=>void;title:string;description:string;variant?:'confirm'|'warning'|'danger';busy?:boolean;children?:ReactNode
}){
 return <DialogShell open={open} onOpenChange={v=>{if(!v&&!busy)onCancel()}} title={title} description={description} width="sm" dismissible={!busy}
  footer={<><Button disabled={busy} onClick={onCancel}>取消</Button><Button disabled={busy} variant={variant==='danger'?'danger':'primary'} onClick={onConfirm}>{busy?'执行中…':'确认'}</Button></>}>
  {children}
 </DialogShell>
}
export const DangerDialog=ConfirmDialog
