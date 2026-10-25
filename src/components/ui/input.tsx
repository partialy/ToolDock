import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
export const Input=forwardRef<HTMLInputElement,InputHTMLAttributes<HTMLInputElement>>(function Input({className,...p},ref){
 return <input ref={ref} {...p} className={cn('h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-indigo-400',className)}/>
})
