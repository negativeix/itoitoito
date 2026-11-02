import { motion, useReducedMotion } from 'motion/react'
import { forwardRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { paperSpring } from '../lib/motion'
import { initialOf } from '../lib/players'
import type { BoardCard, Player } from '../lib/types'
import type { Ghost } from '../store/roomStore'
import { Card } from './Card'

export type TableSize = 'md' | 'lg'

/** Uniform slot geometry so hit-testing and the thread can be computed without measuring. */
export function tableMetrics(count: number, size: TableSize) {
  const w =
    size === 'lg' ? (count <= 4 ? 100 : count <= 6 ? 84 : count <= 10 ? 70 : 60) : count <= 4 ? 84 : count <= 6 ? 72 : count <= 10 ? 62 : 54
  const gap = Math.round(w * 0.16)
  const padX = 16
  const topPad = 30 // room for the thread arcs above the cards
  const h = Math.round((w * 7) / 5)
  return { w, gap, padX, topPad, h, step: w + gap }
}

/** Insertion index under a pointer x (relative to the row's left edge) for `count` other cards. */
export function insertionIndex(localX: number, count: number, size: TableSize, total: number) {
  const { padX, step } = tableMetrics(total, size)
  const i = Math.floor((localX - padX - step) / step + 0.5)
  return Math.max(0, Math.min(count, i))
}

type Slot =
  | { kind: 'zero'; key: string }
  | { kind: 'gap'; key: string }
  | { kind: 'card'; key: string; card: BoardCard; hidden?: boolean; ghost?: boolean }

type Props = {
  cards: BoardCard[] // table order
  players: Player[]
  myPlayerId: string | null
  size?: TableSize
  mode: 'placing' | 'reveal' | 'result'
  /** My secret values, for press-and-hold peeks on my own table cards. */
  myValues?: Record<string, number>
  peekId?: string | null
  /** Local drag: original card hidden (kept mounted), gap shown at insertIndex. */
  dragId?: string | null
  insertIndex?: number | null
  ghosts?: Record<string, Ghost>
  win?: boolean
  onMyCardPointerDown?: (e: ReactPointerEvent, cardId: string) => void
}

export const Table = forwardRef<HTMLDivElement, Props>(function Table(
  { cards, players, myPlayerId, size = 'md', mode, myValues = {}, peekId, dragId, insertIndex, ghosts = {}, win = false, onMyCardPointerDown },
  rowRef,
) {
  const reduce = useReducedMotion()
  const [openClue, setOpenClue] = useState<string | null>(null)
  const byId = new Map(players.map((p) => [p.id, p]))

  // Build the visible slot list: remote ghosts move their card to the previewed index.
  let ordered: Slot[] = cards.map((c) => ({ kind: 'card', key: c.card_id, card: c }))
  if (mode === 'placing') {
    for (const [cardId, g] of Object.entries(ghosts)) {
      if (g.index == null || cardId === dragId) continue
      const from = ordered.findIndex((s) => s.key === cardId)
      if (from < 0) continue
      const [slot] = ordered.splice(from, 1)
      ordered.splice(Math.min(g.index, ordered.length), 0, { ...(slot as Extract<Slot, { kind: 'card' }>), ghost: true })
    }
  }
  const visible = ordered.filter((s) => !(s.kind === 'card' && s.key === dragId))
  if (insertIndex != null && dragId !== undefined) visible.splice(Math.min(insertIndex, visible.length), 0, { kind: 'gap', key: 'gap' })
  const slots: Slot[] = [{ kind: 'zero', key: 'zero' }, ...visible]
  const draggedSlot = ordered.find((s) => s.kind === 'card' && s.key === dragId)
  if (draggedSlot) slots.push({ ...(draggedSlot as Extract<Slot, { kind: 'card' }>), hidden: true })

  const layoutCount = visible.length
  const m = tableMetrics(Math.max(layoutCount, cards.length), size)
  const rowWidth = m.padX * 2 + (layoutCount + 1) * m.step - m.gap
  const cx = (i: number) => m.padX + i * m.step + m.w / 2

  // Thread segments between consecutive visible slots (slot 0 is the zero card).
  const visibleCardSlots = slots.filter((s) => !(s.kind === 'card' && s.hidden))
  const segments = visibleCardSlots.slice(1).map((s, i) => {
    const x1 = cx(i)
    const x2 = cx(i + 1)
    const y = m.topPad + 6
    const d = `M${x1} ${y} Q${(x1 + x2) / 2} ${y - 26} ${x2} ${y}`
    const card = s.kind === 'card' ? s.card : null
    const revealed = card?.revealed_value != null
    return { key: s.key, d, revealed, wrong: !!card?.is_wrong }
  })

  return (
    <div className="-mx-4 overflow-x-auto overflow-y-visible overscroll-x-contain [scrollbar-width:none]" data-table-scroll>
      <div ref={rowRef} className="relative" style={{ width: Math.max(rowWidth, 0), minWidth: '100%', paddingTop: m.topPad, paddingBottom: 40 }}>
        <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={rowWidth} height={m.topPad + 10} aria-hidden="true">
          {segments.map((s) => {
            if (mode === 'placing' || !s.revealed) {
              return <path key={s.key} d={s.d} fill="none" stroke="var(--thread)" strokeOpacity={0.22} strokeWidth={2} strokeLinecap="round" />
            }
            return (
              <motion.path
                key={s.key + (s.wrong ? '-w' : '-ok')}
                d={s.d}
                fill="none"
                stroke={s.wrong ? 'var(--ink-muted)' : 'var(--thread)'}
                strokeWidth={s.wrong ? 2 : 3}
                strokeDasharray={s.wrong ? '4 6' : undefined}
                strokeLinecap="round"
                style={win ? { filter: 'drop-shadow(0 0 6px var(--thread))' } : undefined}
                initial={reduce || mode === 'result' ? false : { pathLength: 0, opacity: 0.4 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            )
          })}
        </svg>

        <div className="flex items-start" style={{ paddingLeft: m.padX, paddingRight: m.padX, gap: m.gap }}>
          {slots.map((s) => {
            if (s.kind === 'zero') {
              return (
                <div key="zero" className="shrink-0" style={{ width: m.w }}>
                  <Card zero className="w-full" label="การ์ด 0 จุดเริ่มต้นของด้าย" />
                </div>
              )
            }
            if (s.kind === 'gap') {
              return (
                <motion.div
                  key="gap"
                  layout
                  transition={paperSpring}
                  className="shrink-0 rounded-card border-2 border-dashed border-thread bg-thread/10"
                  style={{ width: m.w, height: m.h }}
                  aria-hidden="true"
                />
              )
            }
            const c = s.card
            const owner = byId.get(c.owner_player_id)
            const mine = c.owner_player_id === myPlayerId
            const revealed = c.revealed_value != null
            const peeking = peekId === c.card_id && myValues[c.card_id] != null
            const interactive = mine && mode === 'placing' && !!onMyCardPointerDown
            if (s.hidden) {
              // Keep the dragged card's node mounted (touch events need their original target).
              return <div key={s.key} data-card-id={c.card_id} className="absolute size-0 overflow-hidden opacity-0" />
            }
            return (
              <motion.div
                key={s.key}
                layout={!reduce}
                transition={paperSpring}
                data-card-id={c.card_id}
                className={`relative shrink-0 ${interactive ? 'no-callout cursor-grab touch-none' : ''}`}
                style={{ width: m.w }}
                onPointerDown={interactive ? (e) => onMyCardPointerDown!(e, c.card_id) : undefined}
                onContextMenu={(e) => e.preventDefault()}
                animate={revealed && c.is_wrong && !reduce && mode === 'reveal' ? { x: [0, -5, 5, -3, 3, 0] } : undefined}
              >
                {s.ghost && (
                  <span className="absolute -top-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink px-2 text-[11px] font-bold whitespace-nowrap text-bg">
                    กำลังย้าย
                  </span>
                )}
                <div className={s.ghost ? 'rounded-card opacity-80 outline-2 outline-offset-2 outline-ink-muted outline-dashed' : ''}>
                  <Card
                    className="w-full"
                    value={revealed ? c.revealed_value : peeking ? myValues[c.card_id] : null}
                    faceUp={revealed || peeking}
                    color={owner?.color}
                    initials={owner ? initialOf(owner.name) : '?'}
                    mine={mine && !revealed}
                    wrong={revealed && !!c.is_wrong}
                    label={
                      revealed
                        ? `${owner?.name ?? ''} เลข ${c.revealed_value}${c.is_wrong ? ' วางผิด' : ''}`
                        : `การ์ดคว่ำของ ${owner?.name ?? 'ผู้เล่น'}${mine ? ' (ของฉัน)' : ''}`
                    }
                  />
                </div>
                <ClueTag
                  clue={c.clue}
                  name={owner?.name}
                  open={openClue === c.card_id}
                  onToggle={() => setOpenClue((v) => (v === c.card_id ? null : c.card_id))}
                  mine={mine && !revealed}
                />
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

function ClueTag({ clue, name, open, onToggle, mine }: { clue: string | null; name?: string; open: boolean; onToggle: () => void; mine: boolean }) {
  return (
    <div className={`relative flex justify-center ${mine ? 'mt-5' : 'mt-2'}`}>
      {clue ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onToggle}
          className={`max-w-full rounded-[6px] border border-line bg-surface px-1.5 py-0.5 text-[11px] leading-tight shadow-sm ${
            open ? 'absolute top-0 z-20 w-40 text-left text-sm whitespace-normal' : 'truncate'
          }`}
          style={{ rotate: open ? '0deg' : '-1.5deg' }}
          aria-label={`คำใบ้ของ ${name ?? ''}: ${clue}`}
        >
          {clue}
        </button>
      ) : (
        <span className="max-w-full truncate text-[11px] text-ink-muted">{name}</span>
      )}
    </div>
  )
}
