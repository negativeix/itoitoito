import { AnimatePresence, motion } from 'motion/react'
import { useToasts } from '../store/toastStore'

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))]" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className={`max-w-sm rounded-btn px-4 py-2.5 text-sm font-bold shadow-lift ${t.tone === 'error' ? 'bg-danger-ink text-white' : 'bg-ink text-bg'}`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
