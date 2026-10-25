import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
type Props=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger';size?:'sm'|'md'|'icon'}
export const Button=forwardRef<HTMLButtonElement,Props>(function Button({className,variant='secondary',size='md',...rest},ref){
 return <button ref={ref} {...rest} className={cn('inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-[background,color,transform] duration-150 active:scale-[.97] disabled:opacity-40',size==='sm'?'h-8 px-3 text-xs':size==='icon'?'h-8 w-8':'h-9 px-4 text-sm',variant==='primary'?'bg-indigo-500 text-white hover:bg-indigo-400':variant==='danger'?'text-red-400 hover:bg-red-500/10':variant==='ghost'?'hover:bg-[var(--hover)]':'bg-[var(--panel-alt)] hover:bg-[var(--hover)]',className)}/>
})
