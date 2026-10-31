import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { motion } from 'motion/react'
import { useMicroMotion } from './motion-preference'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
}

interface SelectFieldProps {
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  placeholder?: string
  ariaLabel: string
  id?: string
  disabled?: boolean
  className?: string
}

/** 统一的卡片式选择器：Radix 键盘/焦点语义 + Motion 浮层微动画。 */
export function SelectField({
  value, onValueChange, options, placeholder = '请选择',
  ariaLabel, id, disabled, className,
}: SelectFieldProps) {
  const { reduced, off } = useMicroMotion()

  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'flex h-10 min-w-[118px] items-center justify-between gap-3 rounded-xl border border-[var(--border)]',
          'bg-[var(--panel-alt)] px-3 text-left text-xs text-[var(--foreground)] outline-none',
          'transition-[border-color,background-color] duration-150 hover:border-[var(--primary)]/40 hover:bg-[var(--hover)]',
          'focus-visible:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-0',
          'data-[state=open]:border-[var(--primary)] data-[state=open]:ring-0',
          'disabled:cursor-not-allowed disabled:opacity-45', className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={14} className="shrink-0 opacity-60 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          asChild
          position="popper"
          sideOffset={7}
          align="start"
          avoidCollisions
          collisionPadding={12}
        >
          <motion.div
            initial={off ? false : reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: off ? 0 : reduced ? 0.08 : 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'z-[350] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl',
              'border border-[var(--border)] bg-[var(--panel)] p-1.5 text-[var(--foreground)]',
              'shadow-[0_18px_50px_rgba(0,0,0,0.22)] ring-1 ring-white/5',
            )}
          >
            <SelectPrimitive.Viewport className="max-h-[min(340px,var(--radix-select-content-available-height))] overflow-y-auto">
              {options.map(option => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  textValue={option.label}
                  className={cn(
                    'relative mb-1 flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-xl',
                    'border border-transparent px-3 py-2 pr-9 text-xs outline-none last:mb-0',
                    'transition-[background-color,border-color,color,transform] duration-150',
                    'data-[highlighted]:border-[var(--border)] data-[highlighted]:bg-[var(--hover)] focus-visible:outline-none',
                    'data-[state=checked]:border-[var(--primary)]/25 data-[state=checked]:bg-[var(--selected)]',
                    'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
                  )}
                >
                  {option.icon && <span className="flex shrink-0 text-[var(--muted)]">{option.icon}</span>}
                  <div className="min-w-0 flex-1">
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                    {option.description && <p className="mt-0.5 text-[11px] leading-4 text-[var(--muted)]">{option.description}</p>}
                  </div>
                  <SelectPrimitive.ItemIndicator className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--primary)]">
                    <Check size={15} strokeWidth={2.4} />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </motion.div>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
