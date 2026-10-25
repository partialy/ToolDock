import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * 统一文本输入框：仅用单层边框表达焦点，不叠加 outline/ring。
 * 边框始终在组件自身内部，避免靠近容器右侧时焦点框被裁剪。
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        className={cn(
          'h-10 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3',
          'text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]',
          'transition-[border-color,background-color] duration-150',
          'hover:border-[var(--primary)]/40',
          'focus:border-[var(--primary)] focus:outline-none focus:ring-0',
          'focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-0',
          'disabled:cursor-not-allowed disabled:opacity-45',
          className,
        )}
      />
    )
  },
)
