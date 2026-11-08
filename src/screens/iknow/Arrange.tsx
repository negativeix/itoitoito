import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { BottomBar } from '../../components/BottomBar'
import { AnimalCard } from '../../components/iknow/AnimalCard'
import { PrimaryButton } from '../../components/PrimaryButton'
import { api } from '../../lib/api'
import { haptics } from '../../lib/haptics'
import { cardLabel } from '../../lib/iknow'
import { loadIknow } from '../../lib/realtime'
import { toast } from '../../store/toastStore'

const DRAG_PX = 8

type Drag = { card: number; from: 'hand' | 'stage'; x0: number; y0: number; moved: boolean }

/** My turn: build the set after the latest card. Tap to add/remove, drag to reorder or move in/out. */
export function Arrange({ roomId, hand, staging, keeperName }: { roomId: string; hand: number[]; staging: number[]; keeperName: string }) {
  const [local, setLocal] = useState<number[]>(() => staging.filter((c) => hand.includes(c)))
  const [ghost, setGhost] = useState<{ card: number; x: number; y: number } | null>(null)
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const drag = useRef<Drag | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const latest = useRef(local)
  latest.current = local
  // The last arrangement I sent: older echoes from the server are ignored until it comes back.
  const awaiting = useRef<{ key: string; at: number } | null>(null)

  // Follow the server unless I'm mid-drag or waiting for my own latest change to come back.
  useEffect(() => {
    if (drag.current) return
    const w = awaiting.current
    if (w && Date.now() - w.at < 4000) {
      if (staging.join() === w.key) awaiting.current = null
      return
    }
    awaiting.current = null
    setLocal(staging.filter((c) => hand.includes(c)))
  }, [staging, hand])

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  const push = (next: number[]) => {
    setLocal(next)
    awaiting.current = { key: next.join(), at: Date.now() }
    haptics.tap()
    api.ik.stage(roomId, next).catch((e) => {
      awaiting.current = null
      toast((e as Error).message, 'error')
      void loadIknow(roomId)
    })
  }

  /** Insertion index in the staged list (dragged card excluded), or null when outside it. */
  const hit = (x: number, y: number, dragged: number): number | null => {
    const el = stageRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (x < r.left - 24 || x > r.right + 24 || y < r.top - 32 || y > r.bottom + 32) return null
    const cards = [...el.querySelectorAll<HTMLElement>('[data-stage-card]')].filter((n) => Number(n.dataset.stageCard) !== dragged)
    let i = 0
    for (const n of cards) {
      const b = n.getBoundingClientRect()
      if (y < b.top || (y <= b.bottom && x < b.left + b.width / 2)) break
      i++
    }
    return i
  }

  const onDown = (e: ReactPointerEvent, card: number, from: Drag['from']) => {
    if (busy || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    drag.current = { card, from, x0: e.clientX, y0: e.clientY, moved: false }
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > DRAG_PX) d.moved = true
      if (d.moved) {
        setGhost({ card: d.card, x: ev.clientX, y: ev.clientY })
        setInsertAt(hit(ev.clientX, ev.clientY, d.card))
      }
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      const d = drag.current
      drag.current = null
      setGhost(null)
      setInsertAt(null)
      if (!d) return
      const cur = latest.current
      if (!d.moved) {
        push(d.from === 'hand' ? [...cur, d.card] : cur.filter((c) => c !== d.card))
        return
      }
      const idx = hit(ev.clientX, ev.clientY, d.card)
      const without = cur.filter((c) => c !== d.card)
      if (idx !== null) push([...without.slice(0, idx), d.card, ...without.slice(idx)])
      else if (d.from === 'stage') push(without)
    }
    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      drag.current = null
      setGhost(null)
      setInsertAt(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const inHand = hand.filter((c) => !local.includes(c))
  const dragging = ghost?.card
  let shown = 0 // counts non-dragged staged cards, to place the insertion marker

  return (
    <>
      <section
        aria-label="ชุดที่กำลังเรียง"
        className={`mt-3 rounded-[16px] border-2 border-dashed p-2.5 transition-colors lg:p-4 ${insertAt !== null ? 'border-thread bg-thread/10' : 'border-thread-ink/60 bg-thread/5'}`}
      >
        <p className="mb-2 px-0.5 text-xs font-bold text-thread-ink">ชุดที่กำลังเรียง</p>
        <div ref={stageRef} className="flex min-h-24 flex-wrap items-start gap-2 lg:min-h-32 lg:gap-3">
          {local.map((c) => {
            const isDragged = c === dragging
            const marker = !isDragged && insertAt === shown
            if (!isDragged) shown++
            return (
              <div key={c} className="flex items-start gap-2 lg:gap-3">
                {marker && <span className="mt-1 h-16 w-1 rounded-full bg-thread lg:h-24" aria-hidden="true" />}
                <button
                  type="button"
                  data-stage-card={c}
                  aria-label={`เอา ${cardLabel(c)} ออกจากชุด`}
                  onPointerDown={(e) => onDown(e, c, 'stage')}
                  onClick={(e) => e.detail === 0 && push(local.filter((x) => x !== c))}
                  className={`flex w-14 touch-none flex-col items-center gap-1 select-none lg:w-20 ${isDragged ? 'opacity-30' : ''}`}
                >
                  <AnimalCard card={c} className="w-full" />
                  <span className="num grid h-[18px] min-w-5 place-items-center rounded-full bg-thread-ink px-1.5 text-[11px] font-bold text-white">{local.indexOf(c) + 1}</span>
                </button>
              </div>
            )
          })}
          {insertAt !== null && insertAt >= shown && <span className="mt-1 h-16 w-1 rounded-full bg-thread lg:h-24" aria-hidden="true" />}
          {!local.length && <p className="self-center px-1 text-sm text-ink-muted">แตะหรือลากการ์ดในมือมาวางตรงนี้</p>}
        </div>
      </section>

      <section aria-label="มือของฉัน" className="mt-3">
        <p className="mb-2 text-xs font-bold text-ink-muted">มือของฉัน</p>
        <div className="flex flex-wrap gap-2 lg:gap-3">
          {inHand.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`ใส่ ${cardLabel(c)} ต่อท้ายชุด`}
              onPointerDown={(e) => onDown(e, c, 'hand')}
              onClick={(e) => e.detail === 0 && push([...local, c])}
              className={`w-[72px] touch-none select-none lg:w-[104px] ${c === dragging ? 'opacity-30' : ''}`}
            >
              <AnimalCard card={c} className="w-full" />
            </button>
          ))}
          {!inHand.length && <p className="py-4 text-sm text-ink-muted">ใส่ครบทุกใบแล้ว</p>}
        </div>
      </section>

      <BottomBar>
        <PrimaryButton onClick={() => run(() => api.ik.submit(roomId))} disabled={!local.length || busy}>
          {busy ? 'กำลังส่ง…' : local.length ? `ส่งให้ ${keeperName} ตรวจ · ${local.length} ใบ` : `ส่งให้ ${keeperName} ตรวจ`}
        </PrimaryButton>
        <PrimaryButton
          variant="ghost"
          className="mx-auto underline underline-offset-4"
          disabled={busy}
          onClick={() => (armed ? run(() => api.ik.cantPlay(roomId)) : setArmed(true))}
        >
          {armed ? 'แตะอีกครั้ง ให้ผู้คุมเช็กมือ' : 'ลงไม่ได้'}
        </PrimaryButton>
      </BottomBar>

      {ghost &&
        createPortal(
          <div className="pointer-events-none fixed top-0 left-0 z-50 w-16 lg:w-24" style={{ transform: `translate(${ghost.x}px, ${ghost.y}px) translate(-50%, -60%) rotate(-4deg)` }}>
            <AnimalCard card={ghost.card} className="w-full drop-shadow-xl" />
          </div>,
          document.body,
        )}
    </>
  )
}
