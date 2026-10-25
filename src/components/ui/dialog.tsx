import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
export function Modal({open,onOpenChange,title,children,footer}:{open:boolean;onOpenChange:(v:boolean)=>void;title:string;children:ReactNode;footer?:ReactNode}){
 return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
  <AnimatePresence>{open&&<DialogPrimitive.Portal forceMount>
   <DialogPrimitive.Overlay asChild forceMount><motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[99] bg-black/60 backdrop-blur-[3px]"/></DialogPrimitive.Overlay>
   <DialogPrimitive.Content asChild forceMount><div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-3">
    <motion.section initial={{opacity:0,scale:.98,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.98,y:5}} transition={{type:'spring',stiffness:380,damping:34}} className="pointer-events-auto max-h-[90vh] w-full max-w-[500px] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-2xl">
     <div className="mb-5 flex items-center justify-between"><DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title><DialogPrimitive.Close aria-label="关闭" className="rounded-md p-1 hover:bg-[var(--hover)]"><X size={18}/></DialogPrimitive.Close></div>
     {children}{footer&&<div className="mt-5 flex justify-end gap-2">{footer}</div>}
    </motion.section>
   </div></DialogPrimitive.Content>
  </DialogPrimitive.Portal>}</AnimatePresence>
 </DialogPrimitive.Root>
}
