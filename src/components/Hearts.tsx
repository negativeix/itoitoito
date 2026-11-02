import { AnimatePresence, motion } from 'motion/react'
import { IconHeart } from './icons'

/** Level Up hearts (§1.2). */
export function Hearts({ lives, level, max = 3, size = 'size-5' }: { lives: number; level?: number; max?: number; size?: string }) {
  return (
    <div className="flex items-center gap-3" aria-label={`หัวใจ ${lives} จาก ${max}${level ? ` · เลเวล ${level}` : ''}`}>
      {level != null && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-bg">Level {level}</span>}
      <span className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className="relative">
            <span className="text-line">
              <IconHeart className={size} />
            </span>
            <AnimatePresence>
              {i < lives && (
                <motion.span
                  className="absolute inset-0 text-danger"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.6, opacity: 0, rotate: -20 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                >
                  <IconHeart className={size} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        ))}
      </span>
    </div>
  )
}
