import { motion, useMotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { BottomBar } from '../components/BottomBar'
import { Card } from '../components/Card'
import { HandCounts } from '../components/HandCounts'
import { Hearts } from '../components/Hearts'
import { PrimaryButton } from '../components/PrimaryButton'
import { RuleChips } from '../components/RuleChips'
import { Sheet } from '../components/Sheet'
import { nameList, StatusLine } from '../components/StatusLine'
import { insertionIndex, Table } from '../components/Table'
import { TopicBar } from '../components/TopicBar'
import { api } from '../lib/api'
import { positionAt } from '../lib/fractional'
import { haptics } from '../lib/haptics'
import { loadSnapshot, sendDrag } from '../lib/realtime'
import { sound } from '../lib/sound'
import { readLocal, writeLocal } from '../lib/storage'
import type { BoardCard } from '../lib/types'
import { useRevealFeedback } from '../lib/useRevealFeedback'
import { activePlayers, effectiveBoard, myPlayer, tableOrder, useRoom } from '../store/roomStore'
import { toast } from '../store/toastStore'

const HOLD_MS = 220
const DRAG_PX = 10
const HINT_KEY = 'ito.hint.hand'

type Zone = 'table' | 'hand' | null
type Gesture = {
  cardId: string
  origin: 'hand' | 'table'
  x0: number
  y0: number
  x: number
  y: number
  mode: 'pending' | 'peek' | 'drag'
  timer: number
  zone: Zone
  index: number | null
}

export function Play() {
  const room = useRoom((s) => s.room)!
  const players = useRoom((s) => s.players)
  const rawBoard = useRoom((s) => s.board)
  const pending = useRoom((s) => s.pending)
  const ghosts = useRoom((s) => s.ghosts)
  const hand = useRoom((s) => s.hand)
  const me = useRoom(myPlayer)!

  const board = useMemo(() => effectiveBoard({ board: rawBoard, pending, room }), [rawBoard, pending, room])
  const order = useMemo(() => tableOrder(board), [board])
  const myCards = useMemo(() => board.filter((c) => c.owner_player_id === me.id), [board, me.id])
  const handCards = myCards.filter((c) => c.position == null)
  const values = useMemo(() => Object.fromEntries(hand.filter((h) => h.round === room.round).map((h) => [h.card_id, h.value])), [hand, room.round])

  const [peekId, setPeekId] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ cardId: string; origin: 'hand' | 'table' } | null>(null)
  const [insertAt, setInsertAt] = useState<number | null>(null)
  const [overHand, setOverHand] = useState(false)
  const [clueCard, setClueCard] = useState<BoardCard | null>(null)
  const [hintSeen, setHintSeen] = useState(() => readLocal(HINT_KEY) === '1')
  const fx = useMotionValue(-999)
  const fy = useMotionValue(-999)

  const rowRef = useRef<HTMLDivElement>(null)
  const tableZoneRef = useRef<HTMLElement>(null)
  const handZoneRef = useRef<HTMLElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const latest = useRef({ order, board })
  latest.current = { order, board }

  // ---------------------------------------------------------------- moves

  const commitMove = (cardId: string, position: number | null) => {
    const s = useRoom.getState()
    s.setPending(cardId, position)
    haptics.place()
    sound.pop()
    api
      .moveCard(cardId, position)
      .then(() => {
        const cur = useRoom.getState().board.find((c) => c.card_id === cardId)
        if (cur) useRoom.getState().upsertCard({ ...cur, position })
        useRoom.getState().clearPending(cardId)
      })
      .catch((e) => {
        useRoom.getState().clearPending(cardId)
        toast(e.message, 'error')
        void loadSnapshot(room.id)
      })
  }

  // ---------------------------------------------------------------- gesture (tap / hold-to-peek / drag)

  useEffect(() => {
    const hitTest = (g: Gesture) => {
      const { order } = latest.current
      const tz = tableZoneRef.current?.getBoundingClientRect()
      const hz = handZoneRef.current?.getBoundingClientRect()
      let zone: Zone = null
      let index: number | null = null
      if (tz && g.y >= tz.top - 24 && g.y <= tz.bottom + 24) {
        const row = rowRef.current!.getBoundingClientRect()
        const others = order.filter((c) => c.card_id !== g.cardId)
        const revealedCount = others.filter((c) => c.revealed_value != null).length
        zone = 'table'
        // Face-down cards always go to the right of the revealed ones.
        index = Math.max(revealedCount, insertionIndex(g.x - row.left, others.length, 'md', others.length + 1))
      } else if (hz && g.y >= hz.top - 24) {
        zone = 'hand'
      }
      if (zone !== g.zone || index !== g.index) {
        g.zone = zone
        g.index = index
        setInsertAt(index)
        setOverHand(zone === 'hand')
        sendDrag(g.cardId, index)
      }
    }

    let raf = 0
    const autoScroll = () => {
      const g = gesture.current
      const scroller = rowRef.current?.parentElement
      if (g?.mode === 'drag' && scroller && g.zone === 'table') {
        const r = scroller.getBoundingClientRect()
        const edge = 44
        const dx = g.x < r.left + edge ? -12 : g.x > r.right - edge ? 12 : 0
        if (dx) {
          scroller.scrollLeft += dx
          hitTest(g)
        }
      }
      raf = requestAnimationFrame(autoScroll)
    }
    raf = requestAnimationFrame(autoScroll)

    const end = (commit: boolean) => {
      const g = gesture.current
      if (!g) return
      gesture.current = null
      clearTimeout(g.timer)
      if (g.mode === 'peek') setPeekId(null)
      if (g.mode === 'pending' && commit) {
        const card = latest.current.board.find((c) => c.card_id === g.cardId)
        if (card) setClueCard(card)
      }
      if (g.mode === 'drag') {
        setDrag(null)
        setInsertAt(null)
        setOverHand(false)
        sendDrag(g.cardId, null)
        if (commit) {
          const { order, board } = latest.current
          const card = board.find((c) => c.card_id === g.cardId)
          if (card && g.zone === 'table' && g.index != null) {
            const others = order.filter((c) => c.card_id !== g.cardId)
            const currentIndex = order.findIndex((c) => c.card_id === g.cardId)
            if (currentIndex !== g.index || card.position == null) commitMove(card.card_id, positionAt(others.map((c) => c.position!), g.index))
          } else if (card && g.zone === 'hand' && card.position != null) {
            commitMove(card.card_id, null)
          }
        }
      }
    }

    const onMove = (e: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      g.x = e.clientX
      g.y = e.clientY
      if (g.mode !== 'drag' && Math.hypot(g.x - g.x0, g.y - g.y0) > DRAG_PX) {
        clearTimeout(g.timer)
        if (g.mode === 'peek') setPeekId(null) // never carry a visible number around
        g.mode = 'drag'
        setDrag({ cardId: g.cardId, origin: g.origin })
        haptics.tap()
      }
      if (g.mode === 'drag') {
        fx.set(g.x)
        fy.set(g.y)
        hitTest(g)
      }
    }
    const onUp = () => end(true)
    const onCancel = () => end(false)
    const onHide = () => {
      if (document.visibilityState !== 'visible') {
        end(false)
        setPeekId(null)
      }
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onCancel)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onCancel)
      document.removeEventListener('visibilitychange', onHide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onCardDown = (e: ReactPointerEvent, cardId: string, origin: 'hand' | 'table') => {
    if (gesture.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    const g: Gesture = { cardId, origin, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, mode: 'pending', timer: 0, zone: null, index: null }
    g.timer = window.setTimeout(() => {
      if (gesture.current === g && g.mode === 'pending') {
        g.mode = 'peek'
        setPeekId(cardId)
        haptics.tap()
        if (!hintSeen) {
          setHintSeen(true)
          writeLocal(HINT_KEY, '1')
        }
      }
    }, HOLD_MS)
    gesture.current = g
    fx.set(e.clientX)
    fy.set(e.clientY)
  }

  // ---------------------------------------------------------------- flipping

  useRevealFeedback(board)
  const online = useRoom((s) => s.online)
  const [flipping, setFlipping] = useState(false)
  const revealed = order.filter((c) => c.revealed_value != null)
  const wrongSoFar = revealed.filter((c) => c.is_wrong).length
  const allPlaced = board.every((c) => c.position != null)
  const next = allPlaced ? (order.find((c) => c.revealed_value == null) ?? null) : null
  const nextOwner = next ? players.find((p) => p.id === next.owner_player_id) : null
  const myTurn = !!next && next.owner_player_id === me.id
  const isHost = room.host_user_id === me.user_id

  const flip = async () => {
    if (!next) return
    setFlipping(true)
    haptics.tap()
    try {
      await api.flipNext(room.id, next.card_id)
    } catch (e) {
      toast((e as Error).message, 'error')
      void loadSnapshot(room.id)
    } finally {
      setFlipping(false)
    }
  }

  // ---------------------------------------------------------------- status

  const active = activePlayers(players)
  const unplaced = active.filter((p) => board.some((c) => c.owner_player_id === p.id && c.position == null))
  const allMinePlaced = myCards.length > 0 && handCards.length === 0
  const who = (id: string, name: string) => (id === me.id ? 'คุณ' : name)
  let status: string
  if (me.spectating) status = 'คุณเข้ามากลางรอบ รอเล่นรอบถัดไปนะ'
  else if (unplaced.length) status = `รอ ${nameList(unplaced.map((p) => who(p.id, p.name)))} วางการ์ด (${active.length - unplaced.length}/${active.length})`
  else if (myTurn) status = revealed.length ? 'ถึงตาคุณ! คุยกันให้พร้อมแล้วเปิดการ์ดใบถัดไป' : 'ทุกคนวางครบแล้ว ถึงตาคุณเปิดใบแรก!'
  else status = `รอ ${nextOwner?.name ?? 'เพื่อน'} เปิดใบถัดไป · ระหว่างนี้ขยับการ์ดตัวเองได้`

  const draggedCard = drag ? board.find((c) => c.card_id === drag.cardId) : null
  const handWidth = handCards.length >= 3 ? 'w-[27vw] max-w-28' : 'w-32'

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 bg-bg/95 px-4 pb-2 backdrop-blur-sm">
        <TopicBar theme={room.current_theme} />
      </div>
      <HandCounts players={active} board={board} myPlayerId={me.id} show={!me.spectating && !allPlaced} />
      <div className="flex items-center justify-center gap-4">
        {room.mode === 'levelup' && <Hearts lives={Math.max(0, room.lives - wrongSoFar)} level={room.level} />}
        {revealed.length > 0 && (
          <span className="num text-sm font-bold text-ink-muted" aria-live="polite">
            เปิดแล้ว {revealed.length}/{board.length}
          </span>
        )}
      </div>
      <StatusLine tone={myTurn ? 'thread' : wrongSoFar ? 'danger' : 'muted'}>{status}</StatusLine>
      <div className="mt-2">
        <RuleChips />
      </div>

      <section ref={tableZoneRef} className="mt-3 rounded-card bg-surface-2/70" aria-label="โต๊ะกลาง">
        <p className="px-3 pt-2 text-xs font-bold text-ink-muted">โต๊ะ · เรียงจากน้อยไปมาก →</p>
        <Table
          ref={rowRef}
          cards={order}
          players={players}
          myPlayerId={me.id}
          mode="placing"
          myValues={values}
          peekId={peekId}
          dragId={drag?.origin === 'table' ? drag.cardId : drag ? null : undefined}
          insertIndex={drag ? insertAt : null}
          ghosts={ghosts}
          nextId={next?.card_id ?? null}
          onMyCardPointerDown={me.spectating ? undefined : (e, id) => onCardDown(e, id, 'table')}
        />
      </section>

      {!me.spectating && (
        <section
          ref={handZoneRef}
          aria-label="มือของฉัน"
          className={`mt-4 rounded-card border-2 border-dashed px-3 pt-2 pb-4 transition-colors ${
            overHand && drag?.origin === 'table' ? 'border-thread bg-thread/5' : 'border-transparent'
          }`}
        >
          <p className="text-xs font-bold text-ink-muted">มือของฉัน</p>
          {handCards.length > 0 ? (
            <>
              <div className="mt-2 flex items-start justify-center gap-4">
                {handCards.map((c) => (
                  <div key={c.card_id} className={`flex flex-col items-center ${handWidth}`}>
                    <div
                      className={`no-callout w-full cursor-grab touch-none ${drag?.cardId === c.card_id ? 'opacity-25' : ''}`}
                      onPointerDown={(e) => onCardDown(e, c.card_id, 'hand')}
                      onContextMenu={(e) => e.preventDefault()}
                      role="button"
                      tabIndex={0}
                      aria-label="การ์ดของฉัน กดค้างเพื่อดูเลข แตะเพื่อใส่คำใบ้ ลากขึ้นไปวางบนโต๊ะ"
                    >
                      <Card
                        className="w-full"
                        value={values[c.card_id]}
                        faceUp={peekId === c.card_id}
                        color={me.color}
                        name={me.name}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setClueCard(c)}
                      className="mt-2 min-h-10 max-w-full truncate rounded-[8px] px-2 text-sm text-ink-muted underline decoration-dotted underline-offset-4"
                    >
                      {c.clue ? `“${c.clue}”` : 'ใส่คำใบ้'}
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-center text-sm text-ink-muted">
                {hintSeen ? 'ลากการ์ดขึ้นไปวางบนโต๊ะ' : 'กดค้างเพื่อดูเลข · แตะเพื่อพิมพ์คำใบ้ · ลากขึ้นไปวางบนโต๊ะ'}
              </p>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-ink-muted">
              การ์ดของคุณอยู่บนโต๊ะครบแล้ว
              <br />
              กดค้างที่การ์ดบนโต๊ะเพื่อดูเลข · ลากลงมาที่นี่เพื่อเก็บคืน
            </p>
          )}
        </section>
      )}

      <BottomBar>
        {me.spectating ? null : !allMinePlaced ? (
          <PrimaryButton disabled>วางการ์ดให้ครบก่อน</PrimaryButton>
        ) : !next ? (
          <PrimaryButton disabled>รอเพื่อนวางการ์ดให้ครบ</PrimaryButton>
        ) : myTurn ? (
          <PrimaryButton onClick={flip} disabled={flipping}>
            {flipping ? 'กำลังเปิด…' : 'เปิดการ์ดของฉัน'}
          </PrimaryButton>
        ) : isHost && nextOwner && !online.includes(nextOwner.user_id) ? (
          // The owner dropped offline: the host can flip for them.
          <PrimaryButton variant="secondary" onClick={flip} disabled={flipping}>
            เปิดแทน {nextOwner.name} (ออฟไลน์)
          </PrimaryButton>
        ) : null}
      </BottomBar>

      {drag &&
        draggedCard &&
        createPortal(
          <motion.div className="pointer-events-none fixed top-0 left-0 z-50 w-24" style={{ x: fx, y: fy, translateX: '-50%', translateY: '-60%' }}>
            {/* Face-down while dragging: the number is never shown in motion. */}
            <Card lifted color={me.color} name={me.name} className="w-full" />
          </motion.div>,
          document.body,
        )}

      <ClueSheet card={clueCard} onClose={() => setClueCard(null)} />
    </>
  )
}

function ClueSheet({ card, onClose }: { card: BoardCard | null; onClose: () => void }) {
  const [text, setText] = useState('')
  useEffect(() => setText(card?.clue ?? ''), [card])

  const save = async () => {
    if (!card) return
    const clue = text.trim()
    const cur = useRoom.getState().board.find((c) => c.card_id === card.card_id)
    if (cur) useRoom.getState().upsertCard({ ...cur, clue: clue || null })
    onClose()
    try {
      await api.setClue(card.card_id, clue)
    } catch (e) {
      toast((e as Error).message, 'error')
      if (cur) useRoom.getState().upsertCard(cur)
    }
  }

  return (
    <Sheet open={!!card} onClose={onClose} title="คำใบ้ของการ์ดใบนี้">
      <p className="mb-3 text-sm text-ink-muted">พิมพ์สิ่งที่คุณพูดในวง (ไม่บังคับ) · ห้ามใส่ตัวเลข</p>
      <label className="block">
        <span className="sr-only">คำใบ้</span>
        <input
          value={text}
          maxLength={24}
          autoFocus
          enterKeyHint="done"
          placeholder="เช่น ต้มยำกุ้ง"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          className="h-14 w-full rounded-btn border-2 border-line bg-bg px-4 text-lg outline-none focus:border-thread"
        />
      </label>
      <p className="num mt-1 text-right text-xs text-ink-muted">{text.length}/24</p>
      <PrimaryButton className="mt-3" onClick={save}>
        บันทึกคำใบ้
      </PrimaryButton>
      <div className="h-2" />
    </Sheet>
  )
}
