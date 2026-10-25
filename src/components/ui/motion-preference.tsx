import { createContext, useContext } from 'react'
import { useReducedMotion } from 'motion/react'
import type { Settings } from '@/types/models'

export const MotionPreferenceContext = createContext<Settings['motion']>('normal')

/** 对齐应用设置与系统无障碍动画偏好。 */
export function useMicroMotion() {
  const mode = useContext(MotionPreferenceContext)
  const systemReduced = Boolean(useReducedMotion())
  return { off: mode === 'off', reduced: mode !== 'normal' || systemReduced }
}
