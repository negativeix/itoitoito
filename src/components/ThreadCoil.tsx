import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { coilPath } from '../lib/thread'

type Props = {
  width?: number
  height?: number
  loops?: number
  strokeWidth?: number
  /** Animate the thread being drawn on mount. */
  draw?: boolean
  className?: string
}

/** A small coil of red thread — the app's signature mark. */
export function ThreadCoil({ width = 100, height = 40, loops = 3, strokeWidth = 2.5, draw = false, className }: Props) {
  const d = useMemo(() => coilPath({ width, height, loops }), [width, height, loops])
  const reduce = useReducedMotion()
  const animate = draw && !reduce

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true" fill="none">
      <motion.path
        d={d}
        stroke="var(--thread)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: [0.45, 0, 0.2, 1] }}
      />
    </svg>
  )
}
