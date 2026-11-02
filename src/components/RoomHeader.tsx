import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { sound } from '../lib/sound'
import { HowTo } from '../screens/HowTo'
import { IconHelp, IconMore, IconMuted, IconSound } from './icons'
import { Sheet } from './Sheet'

export function MuteButton() {
  const muted = useSyncExternalStore(sound.subscribe, sound.isMuted)
  return (
    <button
      type="button"
      className="grid size-12 place-items-center rounded-full text-ink-muted hover:text-ink"
      aria-label={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
      aria-pressed={muted}
      onClick={() => sound.setMuted(!muted)}
    >
      {muted ? <IconMuted /> : <IconSound />}
    </button>
  )
}

/** Top row on every room screen: room code, help, sound (always top-right, §2.6) and menu. */
export function RoomHeader({ code, menu }: { code?: string; menu?: ReactNode }) {
  const [help, setHelp] = useState(false)
  const [open, setOpen] = useState(false)
  return (
    <header className="flex h-12 items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="num text-2xl leading-none font-bold">ito</span>
        {code && <span className="num rounded-full border border-line bg-surface px-2.5 py-0.5 text-sm font-bold tracking-widest">{code}</span>}
      </div>
      <div className="-mr-3 flex items-center">
        <button type="button" className="grid size-12 place-items-center rounded-full text-ink-muted hover:text-ink" aria-label="วิธีเล่น" onClick={() => setHelp(true)}>
          <IconHelp />
        </button>
        {menu && (
          <button type="button" className="grid size-12 place-items-center rounded-full text-ink-muted hover:text-ink" aria-label="เมนู" onClick={() => setOpen(true)}>
            <IconMore />
          </button>
        )}
        <MuteButton />
      </div>
      <Sheet open={help} onClose={() => setHelp(false)} title="วิธีเล่น">
        <HowTo onDone={() => setHelp(false)} />
      </Sheet>
      {menu && (
        <Sheet open={open} onClose={() => setOpen(false)} title="เมนู">
          <div onClick={() => setOpen(false)}>{menu}</div>
        </Sheet>
      )}
    </header>
  )
}

export function ConnectionBanner({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="sticky top-0 z-40 -mx-4 bg-ink px-4 py-2 text-center text-sm font-bold text-bg" role="status">
      กำลังเชื่อมต่อใหม่…
    </div>
  )
}
