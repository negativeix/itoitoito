import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { BottomBar } from '../components/BottomBar'
import { Hearts } from '../components/Hearts'
import { PrimaryButton } from '../components/PrimaryButton'
import { RuleChips } from '../components/RuleChips'
import { Sheet } from '../components/Sheet'
import { StatusLine } from '../components/StatusLine'
import { ScaleLine } from '../components/TopicBar'
import { CATEGORY_LABELS, type ThemeCategory } from '../data/themes'
import { api } from '../lib/api'
import { haptics } from '../lib/haptics'
import { sound } from '../lib/sound'
import { activePlayers, myPlayer, useRoom } from '../store/roomStore'
import { toast } from '../store/toastStore'

export function Topic() {
  const room = useRoom((s) => s.room)!
  const players = useRoom((s) => s.players)
  const me = useRoom(myPlayer)!
  const reduce = useReducedMotion()
  const theme = room.current_theme
  const isHost = room.host_user_id === me.user_id
  const active = activePlayers(players)
  const votes = active.filter((p) => p.wants_reroll).length
  const needed = Math.floor(active.length / 2) + 1
  const rerollsLeft = 2 - room.theme_rerolls
  const host = players.find((p) => p.user_id === room.host_user_id)
  const [custom, setCustom] = useState(false)
  const [busy, setBusy] = useState(false)

  const vote = () => {
    haptics.tap()
    api.voteReroll(room.id).catch((e) => toast(e.message, 'error'))
  }
  const confirm = async () => {
    setBusy(true)
    try {
      await api.confirmTheme(room.id)
      sound.flip()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {room.mode === 'levelup' && (
        <div className="mt-1 flex justify-center">
          <Hearts lives={room.lives} level={room.level} />
        </div>
      )}
      <p className="mt-3 text-center text-sm font-bold text-ink-muted">
        รอบที่ {room.round} · หัวข้อรอบนี้
        {room.mode === 'levelup' && ` · คนละ ${room.level} ใบ`}
      </p>

      {theme && (
        <div className="mt-3 [perspective:1000px]">
          <motion.article
            key={theme.id}
            initial={reduce ? { opacity: 0 } : { rotateY: -90, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { rotateY: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="relative overflow-hidden rounded-card border border-line bg-surface px-5 pt-8 pb-6 shadow-card"
          >
            <div className="absolute inset-x-0 top-0 h-2 bg-thread" />
            <p className="text-xs font-bold tracking-wide text-thread-ink">
              {theme.category === 'custom' ? 'หัวข้อตั้งเอง' : (CATEGORY_LABELS[theme.category as ThemeCategory] ?? '')}
            </p>
            <h2 className="mt-1 text-2xl leading-snug font-bold">{theme.title}</h2>
            <ScaleLine low={theme.low} high={theme.high} />
            <div className="mt-3 flex justify-between text-xs text-ink-muted">
              <span>เลขน้อย</span>
              <span>เลขมาก</span>
            </div>
          </motion.article>
        </div>
      )}

      <div className="mt-5">
        <RuleChips />
      </div>

      <div className="mt-5">
        <PrimaryButton variant="secondary" onClick={vote} disabled={me.spectating || (rerollsLeft <= 0 && !me.wants_reroll)} aria-pressed={me.wants_reroll}>
          {rerollsLeft <= 0 && !me.wants_reroll ? 'เปลี่ยนหัวข้อครบ 2 ครั้งแล้ว' : me.wants_reroll ? `ยกเลิกโหวต (${votes}/${needed})` : `ขอเปลี่ยนหัวข้อ (${votes}/${needed})`}
        </PrimaryButton>
        <p className="mt-1.5 text-center text-xs text-ink-muted">โหวตเกินครึ่งวงจะสุ่มหัวข้อใหม่ · เหลือ {Math.max(rerollsLeft, 0)} ครั้ง</p>
      </div>

      <BottomBar>
        {isHost ? (
          <>
            <PrimaryButton onClick={confirm} disabled={busy}>
              {busy ? 'กำลังแจกการ์ด…' : 'ใช้หัวข้อนี้'}
            </PrimaryButton>
            <PrimaryButton variant="ghost" className="w-full" onClick={() => setCustom(true)}>
              ตั้งหัวข้อเอง
            </PrimaryButton>
          </>
        ) : (
          <StatusLine>รอ {host?.name ?? 'เจ้าของห้อง'} กดใช้หัวข้อนี้…</StatusLine>
        )}
      </BottomBar>

      <CustomThemeSheet open={custom} onClose={() => setCustom(false)} roomId={room.id} />
    </>
  )
}

function CustomThemeSheet({ open, onClose, roomId }: { open: boolean; onClose: () => void; roomId: string }) {
  const [title, setTitle] = useState('')
  const [low, setLow] = useState('')
  const [high, setHigh] = useState('')
  const valid = title.trim() && low.trim() && high.trim()

  const save = async () => {
    try {
      await api.setCustomTheme(roomId, title, low, high)
      onClose()
      setTitle('')
      setLow('')
      setHigh('')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, max: number, placeholder: string) => (
    <label className="block">
      <span className="mb-1 flex justify-between text-sm font-bold text-ink-muted">
        {label}
        <span className="num font-medium">
          {value.length}/{max}
        </span>
      </span>
      <input
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
        className="h-12 w-full rounded-btn border-2 border-line bg-bg px-3 outline-none focus:border-thread"
      />
    </label>
  )

  return (
    <Sheet open={open} onClose={onClose} title="ตั้งหัวข้อเอง">
      <div className="flex flex-col gap-3 pb-2">
        {field('หัวข้อ', title, setTitle, 60, 'เช่น ความง่วงตอนบ่าย')}
        <div className="grid grid-cols-2 gap-3">
          {field('1 หมายถึง', low, setLow, 24, 'ตาสว่าง')}
          {field('100 หมายถึง', high, setHigh, 24, 'หลับคาโต๊ะ')}
        </div>
        <PrimaryButton onClick={save} disabled={!valid}>
          ใช้หัวข้อนี้
        </PrimaryButton>
      </div>
    </Sheet>
  )
}
