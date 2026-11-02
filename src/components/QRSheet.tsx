import { AnimatePresence, motion } from 'motion/react'
import { QRCodeSVG } from 'qrcode.react'
import { createPortal } from 'react-dom'

/** Full-screen QR so friends can scan it from across the table. */
export function QRFull({ open, onClose, url, code }: { open: boolean; onClose: () => void; url: string; code: string }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.button
          type="button"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 text-[#1E1A15]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          aria-label="ปิด QR"
        >
          <QRCodeSVG value={url} size={300} marginSize={2} className="h-auto w-full max-w-[320px]" />
          <p className="num text-5xl font-bold tracking-[0.3em]">{code}</p>
          <p className="text-base text-[#6E6457]">ให้เพื่อนสแกนเพื่อเข้าห้อง · แตะเพื่อปิด</p>
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export function QRThumb({ url, onClick }: { url: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="shrink-0 rounded-[12px] bg-white p-1.5 shadow-card" aria-label="ขยาย QR ให้เพื่อนสแกน">
      <QRCodeSVG value={url} size={84} marginSize={0} />
    </button>
  )
}
