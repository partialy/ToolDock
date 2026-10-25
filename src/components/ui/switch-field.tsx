import * as SwitchPrimitive from '@radix-ui/react-switch'
import { motion } from 'motion/react'
import { useMicroMotion } from './motion-preference'
import { cn } from '@/lib/utils'

interface SwitchFieldProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  ariaLabel: string
  id?: string
  disabled?: boolean
  className?: string
}

/** 带弹簧滑块的语义化开关，支持 Space 键和无障碍读屏。 */
export function SwitchField({
  checked, onCheckedChange, ariaLabel, id, disabled, className,
}: SwitchFieldProps) {
  const { reduced, off } = useMicroMotion()
  return (
    <SwitchPrimitive.Root
      id={id}
      aria-label={ariaLabel}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full border',
        'border-[var(--border)] bg-[var(--panel-alt)] outline-none',
        'transition-[background-color,border-color,box-shadow] duration-200',
        'data-[state=checked]:border-indigo-500 data-[state=checked]:bg-indigo-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 focus-visible:ring-offset-2',
        'focus-visible:ring-offset-[var(--panel)] disabled:opacity-40',
        className,
      )}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          initial={false}
          animate={{ x: checked ? 21 : 0 }}
          transition={off ? { duration: 0 } : reduced ? { duration: 0.1 } : { type: 'spring', stiffness: 520, damping: 33 }}
          className="pointer-events-none ml-[3px] block h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.24)]"
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
}
