import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomBar } from '../components/BottomBar'
import { Hearts } from '../components/Hearts'
import { IconArrow } from '../components/icons'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { PrimaryButton } from '../components/PrimaryButton'
import { StatusLine } from '../components/StatusLine'
import { Table } from '../components/Table'
import { ThreadConfetti } from '../components/ThreadConfetti'
import { TopicBar } from '../components/TopicBar'
import { api } from '../lib/api'
import { haptics } from '../lib/haptics'
import { placements } from '../lib/judge'
import { sound } from '../lib/sound'
import { myPlayer, useRoom } from '../store/roomStore'
import { toast } from '../store/toastStore'
import type { BoardCard } from '../lib/types'

function revealOrder(board: BoardCard[], round: number) {
  return board.filter((c) => c.round === round && c.reveal_order != null).sort((a, b) => a.reveal_order! - b.reveal_order!)
}

export function Result() {
  const room = useRoom((s) => s.room)!
  const players = useRoom((s) => s.players)
  const board = useRoom((s) => s.board)
  const me = useRoom(myPlayer)!
  const isHost = room.host_user_id === me.user_id
  const host = players.find((p) => p.user_id === room.host_user_id)
  const result = room.last_result
  const order = useMemo(() => revealOrder(board, room.round), [board, room.round])
  const gameOver = room.status === 'game_over'
  const deckComplete = !!result?.deck_complete
  const win = !!result && result.wrong === 0
  const [busy, setBusy] = useState(false)

  // Hearts animate from before → after.
  const [lives, setLives] = useState(result?.lives_before ?? room.lives)
  useEffect(() => {
    const t = setTimeout(() => setLives(result?.lives_after ?? room.lives), 700)
    return () => clearTimeout(t)
  }, [result, room.lives])

  const celebrated = useRef(false)
  useEffect(() => {
    if (celebrated.current || !result) return
    celebrated.current = true
    if (win || deckComplete) {
      sound.win()
      haptics.win()
    }
  }, [result, win, deckComplete])

  const byPlayer = new Map(players.map((p) => [p.id, p]))
  const values = order.map((c) => c.revealed_value ?? 0)
  const place = placements(values)
  const rows = order.map((c, i) => ({ card: c, owner: byPlayer.get(c.owner_player_id), ...place[i] })).sort((a, b) => a.value - b.value)

  let title: string
  let subtitle = ''
  if (deckComplete) {
    title = 'ร้อยด้ายครบทั้งสำรับ!'
    subtitle = `เลขไม่พอให้เล่นเลเวลถัดไปแล้ว · จบที่ Level ${room.level}`
  } else if (gameOver) {
    title = 'Game Over'
    subtitle = `ไปได้ไกลสุด Level ${result?.level ?? room.level}`
  } else if (win) {
    title = 'ร้อยด้ายสำเร็จ!'
    subtitle = room.mode === 'levelup' ? `ผ่าน Level ${room.level} แบบไม่ผิดเลย${(result?.lives_after ?? 0) > (result?.lives_before ?? 0) ? ' · ได้หัวใจคืน 1' : ''}` : 'เรียงถูกทุกใบ'
  } else {
    if (room.mode === 'levelup') {
      title = `ด้ายขาด ${result?.wrong ?? 0} จุด`
      subtitle = `เสีย ${result?.wrong ?? 0} หัวใจ · ผ่าน Level ${room.level}`
    } else {
      // Classic ends at the first wrong card.
      const goodFlips = order.filter((c) => c.is_wrong === false).length
      title = 'ด้ายขาด!'
      subtitle = goodFlips ? `เปิดถูกต่อกัน ${goodFlips} ใบ ก่อนด้ายขาด` : 'ขาดตั้งแต่ใบแรกเลย'
    }
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

  return (
    <>
      {(win || deckComplete) && <ThreadConfetti />}
      <div className="sticky top-0 z-20 -mx-4 bg-bg/95 px-4 pb-2 backdrop-blur-sm">
        <TopicBar theme={room.current_theme} />
      </div>

      <motion.div className="mt-4 text-center" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }}>
        <h1 className={`text-2xl font-bold ${win || deckComplete ? 'text-thread-ink' : gameOver ? 'text-danger-ink' : ''}`}>{title}</h1>
        <p className="text-ink-muted">{subtitle}</p>
        {room.mode === 'levelup' && (
          <div className="mt-2 flex justify-center">
            <Hearts lives={lives} level={result?.level ?? room.level} size="size-7" />
          </div>
        )}
      </motion.div>

      <section className="mt-2" aria-label="โต๊ะหลังเปิดการ์ด">
        <Table cards={order} players={players} myPlayerId={me.id} mode="result" win={win} />
      </section>

      <section className="mt-1">
        <h2 className="mb-2 text-sm font-bold text-ink-muted">เรียงตามเลขจริง</h2>
        <ol className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.card.card_id}
              className={`flex items-center gap-3 rounded-btn border bg-surface px-3 py-2 ${r.card.is_wrong ? 'border-danger' : 'border-line'}`}
            >
              <span className={`num w-11 shrink-0 text-center text-2xl font-bold ${r.card.is_wrong ? 'text-danger' : ''}`}>{r.value}</span>
              {r.owner && <PlayerAvatar player={r.owner} size="sm" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{r.owner?.name ?? 'ผู้เล่น'}</p>
                <p className="line-clamp-2 text-sm text-ink-muted [overflow-wrap:anywhere]">
                  {r.card.is_wrong === null ? 'ไม่ทันได้เปิด · ' : ''}
                  {r.card.clue ? `“${r.card.clue}”` : 'ไม่ได้ใส่คำใบ้'}
                </p>
              </div>
              {r.placed !== r.correct && (
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-ink-muted" aria-label={`วางไว้ลำดับ ${r.placed} ควรอยู่ลำดับ ${r.correct}`}>
                  <span className="num">#{r.placed}</span>
                  <IconArrow />
                  <span className="num text-success-ink">#{r.correct}</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <BottomBar>
        {isHost ? (
          gameOver ? (
            <>
              <PrimaryButton onClick={() => run(() => api.startRound(room.id))} disabled={busy}>
                เล่นอีกครั้ง
              </PrimaryButton>
              <PrimaryButton variant="ghost" className="w-full" onClick={() => run(() => api.backToLobby(room.id))} disabled={busy}>
                กลับล็อบบี้
              </PrimaryButton>
            </>
          ) : (
            <>
              <PrimaryButton onClick={() => run(() => api.nextRound(room.id))} disabled={busy}>
                {room.mode === 'levelup' ? `ไป Level ${room.level + 1}` : 'เล่นรอบต่อไป'}
              </PrimaryButton>
              <PrimaryButton variant="ghost" className="w-full" onClick={() => run(() => api.backToLobby(room.id))} disabled={busy}>
                กลับล็อบบี้
              </PrimaryButton>
            </>
          )
        ) : (
          <StatusLine>รอ {host?.name ?? 'เจ้าของห้อง'} {gameOver ? 'เริ่มเกมใหม่' : 'ไปรอบต่อไป'}…</StatusLine>
        )}
      </BottomBar>
    </>
  )
}
