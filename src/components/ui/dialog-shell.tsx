import type {ReactNode} from 'react'
import * as Primitive from '@radix-ui/react-dialog'
import {AnimatePresence,motion} from 'motion/react'
import {X} from 'lucide-react'
import {useMicroMotion} from './motion-preference'

export type DialogWidth='sm'|'md'|'lg'|'workspace'
export function DialogShell({open,onOpenChange,title,description,children,footer,width='md',dismissible=true,hideClose=false,onOpenAutoFocus}:{
 open:boolean;onOpenChange:(open:boolean)=>void;title:string;description?:string;children:ReactNode;footer?:ReactNode;width?:DialogWidth;dismissible?:boolean;hideClose?:boolean;onOpenAutoFocus?:(e:Event)=>void
}){
 const {off,reduced}=useMicroMotion()
 const size={sm:'max-w-[430px]',md:'max-w-[540px]',lg:'max-w-[720px]',workspace:'max-w-[1120px]'}[width]
 const leave=off?{opacity:0}:reduced?{opacity:0}:{opacity:0,scale:.985,y:5}
 const enter=off?false:reduced?{opacity:0}:{opacity:0,scale:.98,y:9}
 return <Primitive.Root open={open} onOpenChange={v=>{if(!v&&!dismissible)return;onOpenChange(v)}}>
  <AnimatePresence initial={false}>{open&&<Primitive.Portal forceMount>
   <Primitive.Overlay asChild forceMount><motion.div initial={off?false:{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:off?0:reduced?.08:.16}} className="fixed inset-0 z-[290] bg-black/65 backdrop-blur-[3px]"/></Primitive.Overlay>
   <Primitive.Content forceMount
     onEscapeKeyDown={e=>{if(!dismissible)e.preventDefault()}}
     onPointerDownOutside={e=>{if(!dismissible||(e.target instanceof Element&&e.target.closest('[data-msg-viewport]')))e.preventDefault()}}
     onInteractOutside={e=>{if(!dismissible||(e.target instanceof Element&&e.target.closest('[data-msg-viewport]')))e.preventDefault()}}
     onOpenAutoFocus={onOpenAutoFocus}
     className={'fixed left-1/2 top-1/2 z-[291] w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 outline-none '+size}>
    <motion.section initial={enter} animate={{opacity:1,scale:1,y:0}} exit={leave}
     transition={{duration:off?0:reduced?.08:.18,ease:[.22,1,.36,1]}}
     className="flex max-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl">
     <div className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-5 py-4">
      <div className="min-w-0 flex-1"><Primitive.Title className="text-base font-semibold">{title}</Primitive.Title>
       {description&&<Primitive.Description className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 muted">{description}</Primitive.Description>}
       {!description&&<Primitive.Description className="sr-only">ToolDock 对话框</Primitive.Description>}
      </div>
      {!hideClose&&dismissible&&<Primitive.Close aria-label="关闭对话框" className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--hover)]"><X size={17}/></Primitive.Close>}
     </div>
     <div className="min-h-0 flex-1 overflow-y-auto break-words px-5 py-4">{children}</div>
     {footer&&<div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-3">{footer}</div>}
    </motion.section>
   </Primitive.Content>
  </Primitive.Portal>}</AnimatePresence>
 </Primitive.Root>
}
