import type { Transition } from 'motion/react'

/** Paper-weight spring used across the app (ITO_PLAN §2.5). */
export const paperSpring: Transition = { type: 'spring', stiffness: 400, damping: 30 }

/** Card flip timing for press-and-hold reveal. */
export const flipTransition: Transition = { duration: 0.35, ease: [0.3, 0.7, 0.2, 1] }
