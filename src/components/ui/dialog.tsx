import type {ReactNode} from 'react'
import {DialogShell,type DialogWidth} from './dialog-shell'
/** Backward-compatible modal wrapper for existing form and leave guards. */
export function Modal({open,onOpenChange,title,children,footer,width='md'}:{
 open:boolean;onOpenChange:(v:boolean)=>void;title:string;children:ReactNode;footer?:ReactNode;width?:DialogWidth
}){
 return <DialogShell open={open} onOpenChange={onOpenChange} title={title} footer={footer} width={width}>{children}</DialogShell>
}
export const FormDialog=Modal
export const WorkspaceDialog=Modal
