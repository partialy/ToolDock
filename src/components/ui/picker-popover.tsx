import type {ReactNode} from 'react'
import * as Popover from '@radix-ui/react-popover'
import {AnimatePresence,motion} from 'motion/react'
import {useMicroMotion} from './motion-preference'
export function PickerPopoverContent({open,children,className}:{open:boolean;children:ReactNode;className:string}){
 const {off,reduced}=useMicroMotion()
 const initial=off?false:reduced?{opacity:0}:{opacity:0,y:-6,scale:0.975}
 const leave=off?{opacity:1}:reduced?{opacity:0}:{opacity:0,y:-4,scale:0.985}
 return <Popover.Portal forceMount><AnimatePresence initial={false}>
  {open&&<Popover.Content forceMount asChild align="start" sideOffset={7} collisionPadding={12}>
   <motion.div
    initial={initial}
    animate={{opacity:1,y:0,scale:1}}
    exit={leave}
    transition={{duration:off?0:reduced?0.08:0.18,ease:[0.22,1,0.36,1]}}
    className={'z-[250] rounded-2xl border border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] shadow-[0_18px_50px_rgba(0,0,0,0.22)] ring-1 ring-white/5 '+className}>
    {children}
   </motion.div>
  </Popover.Content>}
 </AnimatePresence></Popover.Portal>
}
