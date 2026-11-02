import { useEffect, useMemo, useRef } from 'react'
import { Hearts } from '../components/Hearts'
import { PrimaryButton } from '../components/PrimaryButton'
import { StatusLine } from '../components/StatusLine'
import { Table } from '../components/Table'
import { TopicBar } from '../components/TopicBar'
import { api } from '../lib/api'
import { haptics } from '../lib/haptics'
import { sound } from '../lib/sound'
import { useRevealDriver } from '../lib/useRevealDriver'
import type { BoardCard } from '../lib/types'
import { myPlayer, useRoom } from '../store/roomStore'
import { toast } from '../store/toastStore'

/** Server-ordered cards for the reveal phase. */
export function revealOrder(board: BoardCard[], round: number) {
  return board.filter((c) => c.round === round && c.reveal_order != null).sort((a, b) => a.reveal_order! - b.reveal_order!)
}

export function Reveal() {
  const room = useRoom((s) => s.room)!
  const players = useRoom((s) => s.players)
  const board = useRoom((s) => s.board)
  const me = useRoom(myPlayer)!
  const isHost = room.host_user_id === me.user_id
  const order = useMemo(() => revealOrder(board, room.round), [board, room.round])
  const revealed = order.filter((c) => c.revealed_value != null)
  const rowRef = useRef<HTMLDivElement>(null)

  useRevealDriver()
  useRevealFeedback(order)

  // Keep the newest card in view.
  useEffect(() => {
    const last = revealed[revealed.length - 1]
    if (!last) return
    rowRef.current?.querySelector(`[data-card-id="${last.card_id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [revealed.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const wrong = revealed.filter((c) => c.is_wrong).length

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 bg-bg/95 px-4 pb-2 backdrop-blur-sm">
        <TopicBar theme={room.current_theme} />
      </div>
      {room.mode === 'levelup' && (
        <div className="flex justify-center">
          <Hearts lives={Math.max(0, room.lives - wrong)} level={room.level} />
        </div>
      )}
      <div className="mt-6 text-center">
        <p className="text-sm font-bold text-ink-muted">เปิดการ์ด</p>
        <p className="num text-3xl font-bold" aria-live="polite">
          เปิดแล้ว {revealed.length}/{order.length}
        </p>
      </div>

      <section className="mt-6 flex flex-1 flex-col justify-center" aria-label="โต๊ะกลาง">
        <Table ref={rowRef} cards={order} players={players} myPlayerId={me.id} mode="reveal" size="lg" />
      </section>

      <div className="safe-bottom mt-auto flex flex-col items-center gap-2 pt-4">
        <StatusLine tone={wrong ? 'danger' : 'muted'}>{wrong ? `ด้ายขาดแล้ว ${wrong} จุด…` : 'ลุ้นไปด้วยกัน…'}</StatusLine>
        {isHost && (
          <PrimaryButton variant="ghost" onClick={() => api.revealAll(room.id).catch((e) => toast(e.message, 'error'))}>
            เร่ง · เปิดที่เหลือทั้งหมด
          </PrimaryButton>
        )}
      </div>
    </>
  )
}

/** Flip sound, rising notes for correct cards, a low thud + buzz for wrong ones (§2.6). */
function useRevealFeedback(order: BoardCard[]) {
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    const revealed = order.filter((c) => c.revealed_value != null)
    if (!seen.current) {
      // First render (e.g. rejoining mid-reveal): don't replay old cards.
      seen.current = new Set(revealed.map((c) => c.card_id))
      return
    }
    const fresh = revealed.filter((c) => !seen.current!.has(c.card_id))
    fresh.forEach((c, i) => {
      seen.current!.add(c.card_id)
      const correctSoFar = revealed.filter((x) => !x.is_wrong && x.reveal_order! <= c.reveal_order!).length
      window.setTimeout(() => {
        sound.flip()
        window.setTimeout(() => {
          if (c.is_wrong) {
            sound.wrong()
            haptics.wrong()
          } else {
            sound.correct(correctSoFar - 1)
            haptics.tap()
          }
        }, 160)
      }, i * 120)
    })
  }, [order])
}
