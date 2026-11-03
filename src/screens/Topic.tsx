import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { BottomBar } from '../components/BottomBar'
import { Hearts } from '../components/Hearts'
import { PrimaryButton } from '../components/PrimaryButton'
import { Sheet } from '../components/Sheet'
import { StatusLine } from '../components/StatusLine'
import { ScaleLine } from '../components/TopicBar'
import { CATEGORIES, CATEGORY_LABELS, THEMES, type Theme, type ThemeCategory } from '../data/themes'
import { api } from '../lib/api'
import { haptics } from '../lib/haptics'
import { sound } from '../lib/sound'
import { myPlayer, useRoom } from '../store/roomStore'
import { toast } from '../store/toastStore'

type Filter = ThemeCategory | 'history'

/**
 * Topic phase: custom topics first (anyone in the room can set one), with scrollable
 * suggestions for when the group runs dry. The host deals once a topic is set.
 */
export function Topic() {
  const room = useRoom((s) => s.room)!
  const players = useRoom((s) => s.players)
  const me = useRoom(myPlayer)!
  const theme = room.current_theme
  const isHost = room.host_user_id === me.user_id
  const host = players.find((p) => p.user_id === room.host_user_id)
  const history = room.theme_history ?? []
  const [filter, setFilter] = useState<Filter>('spicy')
  const [form, setForm] = useState<Theme | 'new' | null>(null)
  const [dealing, setDealing] = useState(false)

  const list = useMemo(() => (filter === 'history' ? history : THEMES.filter((t) => t.category === filter)), [filter, history])

  const choose = (t: Theme, sourceId: string | null) => {
    haptics.tap()
    useRoom.getState().patchRoom({ id: room.id, current_theme: { ...t, set_by: me.name } })
    api.setTheme(room.id, t.title, t.low, t.high, sourceId).catch((e) => toast(e.message, 'error'))
  }

  const random = () => {
    const pool = (list.length ? list : THEMES).filter((t) => t.title !== theme?.title)
    const t = pool[Math.floor(Math.random() * pool.length)]
    if (t) choose(t, t.category === 'custom' ? null : t.id)
  }

  const deal = async () => {
    setDealing(true)
    try {
      await api.confirmTheme(room.id)
      sound.flip()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setDealing(false)
    }
  }

  const filters: { value: Filter; label: string }[] = [
    ...CATEGORIES.map((c) => ({ value: c as Filter, label: CATEGORY_LABELS[c] })),
    ...(history.length ? [{ value: 'history' as Filter, label: `วงนี้เคยเล่น (${history.length})` }] : []),
  ]

  return (
    <>
      {room.mode === 'levelup' && (
        <div className="mt-1 flex justify-center">
          <Hearts lives={room.lives} level={room.level} />
        </div>
      )}
      <p className="mt-2 text-center text-sm font-bold text-ink-muted">
        รอบที่ {room.round} · หัวข้อรอบนี้
        {room.mode === 'levelup' && ` · คนละ ${room.level} ใบ`}
      </p>

      <div className="mt-3 [perspective:1000px]">
        <AnimatePresence mode="wait" initial={false}>
          {theme ? (
            <motion.article
              key={theme.title + theme.low + theme.high}
              initial={{ rotateY: -90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: 90, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="relative overflow-hidden rounded-card border border-line bg-surface px-5 pt-7 pb-5 shadow-card"
            >
              <div className="absolute inset-x-0 top-0 h-2 bg-thread" />
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-2xl leading-snug font-bold">{theme.title}</h2>
                <button
                  type="button"
                  onClick={() => setForm(theme)}
                  className="-mt-1 -mr-2 min-h-12 shrink-0 rounded-btn px-3 text-sm font-bold text-thread-ink"
                >
                  แก้
                </button>
              </div>
              <ScaleLine low={theme.low} high={theme.high} />
              {theme.set_by && <p className="mt-3 text-xs text-ink-muted">ตั้งโดย {theme.set_by === me.name ? 'คุณ' : theme.set_by}</p>}
            </motion.article>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-card border-2 border-dashed border-line px-5 py-8 text-center"
            >
              <p className="text-lg font-bold">รอบนี้เล่นหัวข้ออะไรดี?</p>
              <p className="mt-1 text-sm text-ink-muted">คิดหัวข้อฮาๆ ของวงเอง หรือเลื่อนดูไอเดียข้างล่าง ใครตั้งก็ได้</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <PrimaryButton variant="secondary" onClick={() => setForm('new')}>
          ตั้งหัวข้อเอง
        </PrimaryButton>
        <PrimaryButton variant="secondary" block={false} onClick={random} aria-label="สุ่มหัวข้อจากไอเดีย">
          สุ่ม
        </PrimaryButton>
      </div>

      <section className="mt-6" aria-label="ไอเดียหัวข้อ">
        <h3 className="mb-2 text-sm font-bold text-ink-muted">ไอเดียหัวข้อ · แตะเพื่อใช้</h3>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]" role="tablist">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`min-h-10 shrink-0 rounded-full border-2 px-4 text-sm font-bold whitespace-nowrap ${
                filter === f.value ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <ul className="mt-2 flex flex-col gap-2">
          {list.map((t) => {
            const active = theme?.title === t.title
            return (
              <li key={t.id + t.title}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => choose(t, t.category === 'custom' ? null : t.id)}
                  className={`w-full rounded-btn border-2 bg-surface px-4 py-3 text-left transition-colors ${active ? 'border-thread' : 'border-line'}`}
                >
                  <span className="block font-bold">{t.title}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    1 {t.low} → {t.high} 100
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <BottomBar>
        {isHost ? (
          <>
            {!theme && <StatusLine>ตั้งหัวข้อก่อน แล้วค่อยแจกการ์ด</StatusLine>}
            <PrimaryButton onClick={deal} disabled={!theme || dealing}>
              {dealing ? 'กำลังแจกการ์ด…' : 'แจกการ์ด'}
            </PrimaryButton>
          </>
        ) : (
          <StatusLine>{theme ? `รอ ${host?.name ?? 'เจ้าของห้อง'} แจกการ์ด…` : 'ช่วยกันตั้งหัวข้อ ใครตั้งก็ได้'}</StatusLine>
        )}
      </BottomBar>

      <ThemeForm
        initial={form === 'new' ? null : form}
        open={form !== null}
        onClose={() => setForm(null)}
        onSave={(t) => {
          choose(t, null)
          setForm(null)
        }}
      />
    </>
  )
}

function ThemeForm({ open, initial, onClose, onSave }: { open: boolean; initial: Theme | null; onClose: () => void; onSave: (t: Theme) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={initial ? 'แก้หัวข้อ' : 'ตั้งหัวข้อเอง'}>
      {open && <ThemeFormBody key={initial?.title ?? 'new'} initial={initial} onSave={onSave} />}
    </Sheet>
  )
}

function ThemeFormBody({ initial, onSave }: { initial: Theme | null; onSave: (t: Theme) => void }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [low, setLow] = useState(initial?.low ?? '')
  const [high, setHigh] = useState(initial?.high ?? '')
  const valid = title.trim() && low.trim() && high.trim()

  const field = (label: string, value: string, set: (v: string) => void, max: number, placeholder: string, autoFocus = false) => (
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
        autoFocus={autoFocus}
        onChange={(e) => set(e.target.value)}
        className="h-12 w-full rounded-btn border-2 border-line bg-bg px-3 outline-none focus:border-thread"
      />
    </label>
  )

  return (
    <div className="flex flex-col gap-3 pb-2">
      {field('หัวข้อ', title, setTitle, 60, 'เช่น ความดังของคนดัง', !initial)}
      <div className="grid grid-cols-2 gap-3">
        {field('1 หมายถึง', low, setLow, 24, 'ดังในซอย')}
        {field('100 หมายถึง', high, setHigh, 24, 'ระดับโลก')}
      </div>
      <p className="text-xs text-ink-muted">ทุกเลขยังอยู่ในหัวข้อ: 1 คือน้อยที่สุด (ไม่ใช่ "ไม่มีเลย") 100 คือมากที่สุด</p>
      <PrimaryButton
        onClick={() => onSave({ id: 'custom', category: 'custom', title: title.trim(), low: low.trim(), high: high.trim() })}
        disabled={!valid}
      >
        ใช้หัวข้อนี้
      </PrimaryButton>
    </div>
  )
}
