import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { PLAYER_COLORS } from '../lib/players'

const SQUIGGLES = ['M2 10 C6 2, 10 18, 14 10 S22 2, 26 10', 'M2 6 Q8 16 14 6 T26 6', 'M4 4 C14 0, 14 20, 4 16 S14 8, 22 14']

/** Celebration made of little threads, not paper squares (§2.5). */
export function ThreadConfetti() {
  const reduce = useReducedMotion()
  const pieces = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 2.2 + Math.random() * 1.6,
        rot: Math.random() * 360,
        spin: (Math.random() - 0.5) * 540,
        drift: (Math.random() - 0.5) * 80,
        color: i % 3 === 0 ? 'var(--thread)' : PLAYER_COLORS[i % PLAYER_COLORS.length].hex,
        d: SQUIGGLES[i % SQUIGGLES.length],
        scale: 0.7 + Math.random() * 0.8,
      })),
    [],
  )
  if (reduce) return null
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <motion.svg
          key={p.id}
          viewBox="0 0 28 20"
          width={34 * p.scale}
          height={24 * p.scale}
          className="absolute -top-8"
          style={{ left: `${p.x}%` }}
          initial={{ y: -40, rotate: p.rot, opacity: 1 }}
          animate={{ y: '110vh', x: p.drift, rotate: p.rot + p.spin, opacity: [1, 1, 0.8] }}
          transition={{ duration: p.dur, delay: p.delay, ease: 'easeIn' }}
        >
          <path d={p.d} fill="none" stroke={p.color} strokeWidth={2.6} strokeLinecap="round" />
        </motion.svg>
      ))}
    </div>,
    document.body,
  )
}
