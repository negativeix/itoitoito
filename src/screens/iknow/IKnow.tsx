import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BottomBar } from '../../components/BottomBar'
import { AnimalCard, Difficulty, RuleCard } from '../../components/iknow/AnimalCard'
import { PrimaryButton } from '../../components/PrimaryButton'
import { Sheet } from '../../components/Sheet'
import { StatusLine } from '../../components/StatusLine'
import { ikRule } from '../../data/iknowRules'
import { api } from '../../lib/api'
import { haptics } from '../../lib/haptics'
import { cardLabel, signed, type IkState } from '../../lib/iknow'
import { initialOf, inkOn } from '../../lib/players'
import { sound } from '../../lib/sound'
import type { Player } from '../../lib/types'
import { myPlayer, useRoom } from '../../store/roomStore'
import { toast } from '../../store/toastStore'
import { Arrange } from './Arrange'
import { nextBySeat, PlayerList, PlayerStrip, RejectedList, RuleBar, TableGrid, type Who } from './parts'

// Override the primary button's red: purple for keeper/guess steps, green for "pass".
const PURPLE_BTN = 'bg-[#4B2E83]! disabled:bg-surface-2! disabled:text-ink-muted'
const GREEN_BTN = 'bg-[#1F7A4D]! disabled:bg-surface-2! disabled:text-ink-muted'

/** ใครไม่รู้ in a room: one screen per phase, the same on phone and computer (wider layout on lg). */
export function IKnow() {
  const room = useRoom((s) => s.room)!
  const players = useRoom((s) => s.players)
  const me = useRoom(myPlayer)!
  const ik = useRoom((s) => s.ik)
  const hand = useRoom((s) => s.ikHand)
  const secret = useRoom((s) => s.ikSecret)
  const [hideRule, setHideRule] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  useEventToasts(ik, players, me)

  if (!ik) return <p className="mt-10 text-center text-ink-muted">กำลังโหลดเกม…</p>

  const byId = (id: string | null | undefined) => players.find((p) => p.id === id)
  const name = (id: string | null | undefined) => (id === me.id ? 'คุณ' : (byId(id)?.name ?? 'ผู้เล่น'))
  const who: Who = { me, players, ik, byId }
  const isKeeper = me.id === ik.keeper_id
  const isHost = room.host_user_id === me.user_id
  const keeperName = byId(ik.keeper_id)?.name ?? 'ผู้คุม'
  const ctx = { room: room.id, ik, me, hand, secret, isKeeper, isHost, keeperName, name, byId, players, hostName: byId(players.find((p) => p.user_id === room.host_user_id)?.id)?.name ?? 'เจ้าของห้อง' }
  const inPlay = !['done', 'final'].includes(ik.phase)

  let body: ReactNode
  if (me.spectating && inPlay) body = <Spectating ik={ik} />
  else
    switch (ik.phase) {
      case 'pick_rule':
        body = isKeeper ? <PickRule {...ctx} /> : <Waiting text={`${keeperName} กำลังเลือกกฎลับ`} hand={hand} />
        break
      case 'pick_start':
        body = isKeeper ? <PickStart {...ctx} /> : <Waiting text={`${keeperName} กำลังเลือกใบแรกบนโต๊ะ`} hand={hand} />
        break
      case 'turn':
        body = <TurnView {...ctx} />
        break
      case 'judging':
        body = isKeeper ? <Judge {...ctx} /> : <JudgingWait {...ctx} />
        break
      case 'checking':
        body = isKeeper ? <Check {...ctx} /> : <CheckingWait {...ctx} />
        break
      case 'guessing':
        body = me.id === ik.guesser_id ? <Guess {...ctx} /> : <GuessWait {...ctx} />
        break
      case 'guess_wrong':
        body = <GuessWrong {...ctx} />
        break
      case 'done':
        body = <RoundResult {...ctx} />
        break
      default:
        body = <Final {...ctx} />
    }

  return (
    <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6 lg:pt-2">
      <aside className="hidden lg:flex lg:flex-col lg:gap-4">
        <PlayerList {...who} />
        {inPlay && ik.rejected.length > 0 && (
          <section className="rounded-[18px] border border-line bg-surface p-3">
            <p className="mb-2 flex justify-between text-xs font-bold text-ink-muted">
              ชุดที่ไม่ผ่าน · {ik.rejected.length}
              {ik.rejected.length > 4 && (
                <button type="button" className="underline underline-offset-2" onClick={() => setHistoryOpen(true)}>
                  ดูทั้งหมด
                </button>
              )}
            </p>
            <RejectedList ik={ik} byId={byId} limit={4} />
          </section>
        )}
      </aside>
      <div className="flex min-w-0 flex-col">
        {inPlay && (
          <div className="sticky top-0 z-20 -mx-4 bg-bg/95 px-4 pt-1 pb-2 backdrop-blur-sm lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
            <RuleBar ik={ik} isKeeper={isKeeper} keeperName={keeperName} ruleId={secret.rule} hidden={hideRule} onToggle={() => setHideRule((v) => !v)} />
          </div>
        )}
        <PlayerStrip {...who} />
        {inPlay && ik.rejected.length > 0 && (
          <button type="button" className="mt-2 self-end text-xs font-bold text-ink-muted underline underline-offset-2 lg:hidden" onClick={() => setHistoryOpen(true)}>
            ไม่ผ่าน {ik.rejected.length} ชุด
          </button>
        )}
        {body}
      </div>
      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="ชุดที่ไม่ผ่าน">
        <div className="pb-4">
          <RejectedList ik={ik} byId={byId} />
        </div>
      </Sheet>
    </div>
  )
}

type Ctx = {
  room: string
  ik: IkState
  me: Player
  hand: number[]
  secret: ReturnType<typeof useRoom.getState>['ikSecret']
  isKeeper: boolean
  isHost: boolean
  keeperName: string
  hostName: string
  name: (id: string | null | undefined) => string
  byId: (id: string | null | undefined) => Player | undefined
  players: Player[]
}

// ---------------------------------------------------------------- helpers

function useRun() {
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    haptics.tap()
    try {
      await fn()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

/** Short toasts for what just happened at the table. */
function useEventToasts(ik: IkState | null, players: Player[], me: Player) {
  const prev = useRef<IkState | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = ik
    if (!p || !ik || p.round !== ik.round) return
    const nm = (id: string) => (id === me.id ? 'คุณ' : (players.find((x) => x.id === id)?.name ?? 'ผู้เล่น'))
    if (ik.rejected.length > p.rejected.length) {
      toast(`ไม่ผ่าน · ${nm(ik.rejected.at(-1)!.p)} เอาการ์ดคืนมือ`)
      haptics.wrong?.()
    } else if (p.phase === 'judging' && ik.table_cards.length > p.table_cards.length) {
      toast(`ผ่าน! ${nm(p.turn_id!)} ลง ${ik.table_cards.length - p.table_cards.length} ใบ`)
      sound.pop()
    } else if (ik.last_check && JSON.stringify(ik.last_check) !== JSON.stringify(p.last_check)) {
      const c = ik.last_check
      toast(c.card != null ? `${nm(c.p)} ลงได้ · ผู้คุมลง ${cardLabel(c.card)} ให้ แล้วจั่วเพิ่ม 1 ใบ` : `${nm(c.p)} ลงไม่ได้จริง · เหลือ ${Math.max(0, (c.n ?? 1) - 1)} ใบ`)
    }
  }, [ik, players, me])
}

function MyHand({ cards, label = 'มือของฉัน' }: { cards: number[]; label?: string }) {
  if (!cards.length) return null
  return (
    <section aria-label={label} className="mt-3">
      <p className="mb-2 text-xs font-bold text-ink-muted">{label}</p>
      <div className="flex flex-wrap gap-2 lg:gap-3">
        {cards.map((c) => (
          <AnimalCard key={c} card={c} className="w-[64px] lg:w-[96px]" />
        ))}
      </div>
    </section>
  )
}

function Title({ children, sub, tone = 'ink' }: { children: ReactNode; sub?: ReactNode; tone?: 'ink' | 'good' | 'bad' }) {
  const color = { ink: '', good: 'text-success-ink', bad: 'text-danger-ink' }[tone]
  return (
    <div className="mt-5 text-center lg:text-left">
      <h1 className={`text-2xl font-bold lg:text-3xl ${color}`}>{children}</h1>
      {sub && <p className="mt-0.5 text-ink-muted">{sub}</p>}
    </div>
  )
}

function Waiting({ text, hand }: { text: string; hand: number[] }) {
  return (
    <>
      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        <span
          className="grid h-24 w-[68px] place-items-center rounded-xl border-2 border-[#1d1b18] font-[Fraunces] text-5xl font-extrabold text-white shadow-[0_4px_0_#1d1b18]"
          style={{ background: 'repeating-linear-gradient(135deg, #4B2E83 0 10px, #3A2366 10px 20px)' }}
          aria-hidden="true"
        >
          ?
        </span>
        <StatusLine>{text}…</StatusLine>
      </div>
      <MyHand cards={hand} />
    </>
  )
}

function Spectating({ ik }: { ik: IkState }) {
  return (
    <>
      <div className="mt-3">
        <StatusLine>คุณเข้ามากลางรอบ ได้เล่นตั้งแต่รอบหน้านะ</StatusLine>
      </div>
      {ik.table_cards.length > 0 && (
        <div className="mt-3">
          <TableGrid cards={ik.table_cards} />
        </div>
      )}
    </>
  )
}

function StagedRow({ cards, tone, title }: { cards: number[]; tone: 'live' | 'locked'; title: string }) {
  const color = tone === 'live' ? '#7C4DDB' : '#5B34B0'
  return (
    <section
      aria-label={title}
      className={`mt-3 rounded-[16px] p-2.5 lg:p-4 ${tone === 'live' ? 'border-2 border-dashed bg-[#7C4DDB]/5' : 'border-2 bg-surface shadow-card'}`}
      style={{ borderColor: color }}
    >
      <p className="mb-2 flex items-center gap-2 px-0.5 text-xs font-bold" style={{ color }}>
        {tone === 'live' ? <span className="size-2 rounded-full bg-[#7C4DDB] shadow-[0_0_0_3px_rgba(124,77,219,.25)]" /> : <LockIcon />}
        {title}
      </p>
      <div className="flex min-h-16 flex-wrap items-start gap-2 lg:gap-3">
        {cards.map((c, i) => (
          <div key={c} className="flex w-14 flex-col items-center gap-1 lg:w-20">
            <AnimalCard card={c} className="w-full" />
            <span className="num grid h-[18px] min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white" style={{ background: color }}>
              {i + 1}
            </span>
          </div>
        ))}
        {!cards.length && <p className="self-center px-1 text-sm text-ink-muted">ยังไม่ได้วาง</p>}
      </div>
    </section>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

// ---------------------------------------------------------------- keeper setup

function PickRule({ room, secret }: Ctx) {
  const options = secret.rule_options ?? []
  const [pick, setPick] = useState<number | null>(null)
  const { busy, run } = useRun()
  return (
    <>
      <Title sub="สุ่มมาให้ 3 ใบ เลือก 1">เลือกกฎลับรอบนี้</Title>
      <fieldset className="mt-5 grid gap-3 lg:grid-cols-3 lg:gap-5">
        <legend className="sr-only">กฎลับ 3 ใบ</legend>
        {options.map((id) => {
          const r = ikRule(id)
          const on = pick === id
          return (
            <label
              key={id}
              className={`block cursor-pointer rounded-[18px] border-2 border-[#1d1b18] bg-[#4B2E83] p-3 text-white transition-transform lg:p-4 ${on ? '-translate-y-1 shadow-[0_0_0_3px_var(--bg),0_0_0_6px_#4B2E83]' : 'shadow-[0_3px_0_#1d1b18]'}`}
            >
              <span className="mb-2 flex items-center gap-2">
                <input type="radio" name="rule" checked={on} onChange={() => setPick(id)} className="size-5 accent-[#F7B3CB]" />
                <span className="text-xs font-bold text-[#E6DDF5]">กฎลับ #{id}</span>
              </span>
              <span className="block rounded-xl bg-[#FFFBF3] px-3 py-3 text-lg font-bold text-[#1d1b18] lg:min-h-36 lg:text-xl">{r?.text}</span>
              {r && <Difficulty level={r.level} className="mt-2" />}
            </label>
          )
        })}
      </fieldset>
      <BottomBar>
        <PrimaryButton className={PURPLE_BTN} disabled={pick == null || busy} onClick={() => pick != null && run(() => api.ik.pickRule(room, pick))}>
          ใช้กฎนี้
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

function PickStart({ room, secret, ik }: Ctx) {
  const deck = secret.deck ?? []
  const [pick, setPick] = useState<number | null>(null)
  const { busy, run } = useRun()
  return (
    <>
      <Title sub={`เลือกจากการ์ดที่ยังอยู่ในกอง ${deck.length} ใบ`}>เลือกการ์ดใบแรกบนโต๊ะ</Title>
      <ul aria-label="การ์ดในกอง" className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-10 lg:gap-3">
        {deck.map((c) => (
          <li key={c}>
            <button type="button" aria-pressed={pick === c} aria-label={`เลือก ${cardLabel(c)}`} onClick={() => setPick(c)} className="block w-full">
              <AnimalCard card={c} ring={pick === c ? '#4B2E83' : undefined} />
            </button>
          </li>
        ))}
      </ul>
      <BottomBar>
        <PrimaryButton className={PURPLE_BTN} disabled={pick == null || busy || ik.phase !== 'pick_start'} onClick={() => pick != null && run(() => api.ik.pickStart(room, pick))}>
          {pick != null ? `วาง ${cardLabel(pick)} เป็นใบแรก` : 'วางเป็นใบแรก'}
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

// ---------------------------------------------------------------- turns

function TurnView({ room, ik, me, hand, isKeeper, keeperName, name, players }: Ctx) {
  const mine = me.id === ik.turn_id
  const next = nextBySeat(players, ik.turn_id, [ik.keeper_id])
  return (
    <>
      <div className="mt-3">
        <StatusLine tone={mine ? 'thread' : 'muted'}>
          {mine ? `ตาคุณ เรียงการ์ดแล้วส่งให้ ${keeperName}` : `รอ ${name(ik.turn_id)} เรียงการ์ด${!isKeeper && next?.id === me.id ? ' · ตาถัดไปของคุณ' : ''}`}
        </StatusLine>
      </div>
      <div className="mt-2">
        <TableGrid cards={ik.table_cards} />
      </div>
      {mine ? (
        <Arrange roomId={room} hand={hand} staging={ik.staging} keeperName={keeperName} />
      ) : (
        <>
          <StagedRow cards={ik.staging} tone="live" title={`${name(ik.turn_id)} กำลังเรียง`} />
          {!isKeeper && <MyHand cards={hand} />}
          {!isKeeper && (
            <BottomBar>
              <PrimaryButton disabled>รอ {name(ik.turn_id)} ส่งให้ผู้คุม</PrimaryButton>
            </BottomBar>
          )}
        </>
      )}
    </>
  )
}

function Judge({ room, ik, name }: Ctx) {
  const { busy, run } = useRun()
  const last = ik.table_cards.at(-1)
  return (
    <>
      <div className="mt-3">
        <StatusLine tone="thread">
          {name(ik.turn_id)} ส่งมา {ik.staging.length} ใบ · ตัดสินว่าผ่านไหม
        </StatusLine>
      </div>
      <div className="mt-2">
        <TableGrid cards={ik.table_cards} />
      </div>
      <section aria-label="ชุดที่ส่งมา" className="mt-3 rounded-[18px] border-2 border-[#7C4DDB] bg-surface p-3 shadow-card lg:p-5">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold text-[#5B34B0]">
          <LockIcon /> ชุดของ {name(ik.turn_id)}
        </p>
        <div className="flex flex-wrap items-start gap-2 lg:gap-3">
          {last != null && (
            <div className="flex w-16 flex-col items-center gap-1 lg:w-24">
              <AnimalCard card={last} className="w-full" faded />
              <span className="text-[11px] text-ink-muted">ใบล่าสุด</span>
            </div>
          )}
          <svg viewBox="0 0 24 24" className="mt-8 size-5 shrink-0 text-ink-muted lg:mt-12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          {ik.staging.map((c, i) => (
            <div key={c} className="flex w-16 flex-col items-center gap-1 lg:w-24">
              <AnimalCard card={c} className="w-full" />
              <span className="num grid h-[18px] min-w-5 place-items-center rounded-full bg-[#7C4DDB] px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
            </div>
          ))}
        </div>
      </section>
      <BottomBar>
        <div className="grid grid-cols-2 gap-2.5">
          <PrimaryButton variant="secondary" disabled={busy} onClick={() => run(() => api.ik.judge(room, false))}>
            ไม่ผ่าน
          </PrimaryButton>
          <PrimaryButton className={GREEN_BTN} disabled={busy} onClick={() => run(() => api.ik.judge(room, true))}>
            ผ่าน
          </PrimaryButton>
        </div>
      </BottomBar>
    </>
  )
}

function JudgingWait({ ik, hand, keeperName, name, isKeeper }: Ctx) {
  return (
    <>
      <div className="mt-3">
        <StatusLine>รอ {keeperName} ตรวจชุดของ {name(ik.turn_id)}</StatusLine>
      </div>
      <div className="mt-2">
        <TableGrid cards={ik.table_cards} />
      </div>
      <StagedRow cards={ik.staging} tone="locked" title={`ส่งให้ ${keeperName} ตรวจแล้ว`} />
      {!isKeeper && <MyHand cards={hand} />}
    </>
  )
}

function Check({ room, ik, secret, name }: Ctx) {
  const cards = secret.check_hand ?? []
  const [pick, setPick] = useState<number | null>(null)
  const [open, setOpen] = useState(true)
  const { busy, run } = useRun()
  return (
    <>
      <div className="mt-3">
        <StatusLine tone="thread">{name(ik.check_id)} บอกว่าลงไม่ได้ · เช็กมือ</StatusLine>
      </div>
      <div className="mt-2">
        <TableGrid cards={ik.table_cards} />
      </div>
      <section aria-labelledby="check-title" className="mt-3 rounded-[18px] border-2 border-[#2F9E8F] bg-surface p-3 shadow-card lg:p-5">
        <div className="flex items-center gap-3">
          <h2 id="check-title" className="min-w-0 flex-1 font-bold">
            มือของ {name(ik.check_id)} · {cards.length} ใบ
          </h2>
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="min-h-10 rounded-full border border-line bg-bg px-4 text-sm font-bold">
            {open ? 'พับ' : 'กาง'}
          </button>
        </div>
        {open && (
          <ul aria-label={`มือของ ${name(ik.check_id)}`} className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7 lg:gap-3">
            {cards.map((c) => (
              <li key={c}>
                <button type="button" aria-pressed={pick === c} aria-label={`เลือก ${cardLabel(c)}`} onClick={() => setPick(pick === c ? null : c)} className="block w-full">
                  <AnimalCard card={c} ring={pick === c ? '#1F7A4D' : undefined} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <BottomBar>
        <div className="grid grid-cols-2 gap-2.5">
          <PrimaryButton variant="secondary" disabled={busy} onClick={() => run(() => api.ik.check(room, null))}>
            ลงไม่ได้จริง
          </PrimaryButton>
          <PrimaryButton className={GREEN_BTN} disabled={pick == null || busy} onClick={() => pick != null && run(() => api.ik.check(room, pick))}>
            ลงใบนี้ให้
          </PrimaryButton>
        </div>
      </BottomBar>
    </>
  )
}

function CheckingWait({ ik, hand, keeperName, name, isKeeper }: Ctx) {
  return (
    <>
      <div className="mt-3">
        <StatusLine>
          {name(ik.check_id)} บอกว่าลงไม่ได้ · {keeperName} กำลังเช็กมือ
        </StatusLine>
      </div>
      <div className="mt-2">
        <TableGrid cards={ik.table_cards} />
      </div>
      {!isKeeper && <MyHand cards={hand} />}
    </>
  )
}

// ---------------------------------------------------------------- guessing

function WrongSoFar({ ik, name }: Pick<Ctx, 'ik' | 'name'>) {
  if (!ik.wrong_guesses.length) return null
  return (
    <section className="mt-3 rounded-[16px] border border-line bg-surface p-3">
      <p className="mb-1.5 text-xs font-bold text-ink-muted">ทายผิดไปแล้ว</p>
      <ul className="flex flex-col gap-1">
        {ik.wrong_guesses.map((w, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="font-bold text-danger-ink">✕</span>
            <span>
              {ikRule(w.rule)?.text} <span className="text-ink-muted">· {name(w.p)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Guess({ room, ik, me, secret, name }: Ctx) {
  const options = secret.guess_options ?? []
  const [pick, setPick] = useState<number | null>(null)
  const { busy, run } = useRun()
  const emptied = ik.emptied_id === me.id
  return (
    <>
      <Title sub="เลือก 1 ใน 3">{emptied ? 'หมดมือแล้ว! ทายกฎลับ' : 'ถึงตาคุณทายกฎลับ'}</Title>
      <div className="mt-4">
        <TableGrid cards={ik.table_cards} dense />
      </div>
      <fieldset className="mt-4 grid gap-2.5 lg:grid-cols-3 lg:gap-4">
        <legend className="sr-only">กฎไหนคือของจริง</legend>
        {options.map((id, i) => {
          const on = pick === id
          return (
            <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-[16px] p-3.5 lg:min-h-28 lg:p-4 ${on ? 'border-2 border-[#4B2E83] bg-[#4B2E83]/10 shadow-card' : 'border border-line bg-surface'}`}>
              <input type="radio" name="guess" checked={on} onChange={() => setPick(id)} className="mt-1 size-5 shrink-0 accent-[#4B2E83]" />
              <span className="flex-1 font-bold lg:text-lg">{ikRule(id)?.text}</span>
              <span className="num text-lg font-extrabold text-[#4B2E83]">{'ABC'[i]}</span>
            </label>
          )
        })}
      </fieldset>
      <WrongSoFar ik={ik} name={name} />
      <BottomBar>
        <PrimaryButton className={PURPLE_BTN} disabled={pick == null || busy} onClick={() => pick != null && run(() => api.ik.guess(room, pick))}>
          {pick != null ? `ตอบข้อ ${'ABC'[options.indexOf(pick)]}` : 'เลือกคำตอบก่อน'}
        </PrimaryButton>
      </BottomBar>
    </>
  )
}

function GuessWait({ ik, hand, name, isKeeper }: Ctx) {
  return (
    <>
      <div className="mt-3">
        <StatusLine tone="thread">{name(ik.guesser_id)} กำลังทายกฎลับ</StatusLine>
      </div>
      <div className="mt-2">
        <TableGrid cards={ik.table_cards} />
      </div>
      <WrongSoFar ik={ik} name={name} />
      {!isKeeper && <MyHand cards={hand} />}
    </>
  )
}

function GuessWrong({ room, ik, me, name, players, isHost }: Ctx) {
  const { busy, run } = useRun()
  const last = ik.wrong_guesses.at(-1)
  const next = nextBySeat(players, ik.guesser_id, [ik.keeper_id])
  return (
    <>
      <div className="mt-8 flex flex-col items-center text-center">
        <span className="grid size-16 place-items-center rounded-full bg-danger/15" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-8 text-danger-ink" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </span>
        <h1 className="mt-3 text-2xl font-bold text-danger-ink lg:text-3xl">{name(ik.guesser_id)} ทายผิด</h1>
      </div>
      {last && (
        <section className="mx-auto mt-5 w-full max-w-xl">
          <p className="mb-1.5 text-xs font-bold text-ink-muted">กฎที่ {name(last.p)} ทาย</p>
          <div className="flex items-center gap-3 rounded-[16px] border-2 border-danger bg-danger/10 p-3.5">
            <span className="min-w-0 flex-1">
              <span className="block font-bold line-through lg:text-lg">{ikRule(last.rule)?.text}</span>
              <span className="block text-xs font-bold text-danger-ink">ไม่ใช่กฎนี้</span>
            </span>
          </div>
        </section>
      )}
      <div className="mx-auto w-full max-w-xl">
        <WrongSoFar ik={ik} name={name} />
      </div>
      <BottomBar>
        {next?.id === me.id ? (
          <>
            <StatusLine tone="thread">ถึงคิวคุณทายต่อ</StatusLine>
            <PrimaryButton className={PURPLE_BTN} disabled={busy} onClick={() => run(() => api.ik.passGuess(room))}>
              ทายต่อ
            </PrimaryButton>
          </>
        ) : (
          <>
            <StatusLine>รอ {next ? name(next.id) : 'คนถัดไป'} กดทายต่อ</StatusLine>
            {isHost && (
              <PrimaryButton variant="ghost" className="mx-auto underline underline-offset-4" disabled={busy} onClick={() => run(() => api.ik.passGuess(room))}>
                ส่งต่อให้ {next ? name(next.id) : 'คนถัดไป'} ทายเลย
              </PrimaryButton>
            )}
          </>
        )}
      </BottomBar>
    </>
  )
}

// ---------------------------------------------------------------- results

function ScoreAvatar({ p }: { p: Player | undefined }) {
  if (!p) return null
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold" style={{ background: p.color, color: inkOn(p.color) }} aria-hidden="true">
      {initialOf(p.name)}
    </span>
  )
}

function RoundResult({ room, ik, isHost, hostName, name, byId, players }: Ctx) {
  const { busy, run } = useRun()
  const nextKeeper = nextBySeat(players, ik.keeper_id, ik.keepers_done)
  const res = ik.result
  const footer = (
    <BottomBar>
      {isHost ? (
        <>
          <PrimaryButton disabled={busy} onClick={() => run(() => api.ik.nextRound(room))}>
            {nextKeeper ? 'เริ่มรอบถัดไป' : 'ดูอันดับรวม'}
          </PrimaryButton>
          {nextKeeper && (
            <PrimaryButton variant="ghost" className="mx-auto underline underline-offset-4" disabled={busy} onClick={() => run(() => api.ik.endGame(room))}>
              จบเกม ดูอันดับ
            </PrimaryButton>
          )}
        </>
      ) : (
        <StatusLine>รอ {hostName} ไปรอบต่อไป…</StatusLine>
      )}
    </BottomBar>
  )
  if (!res || res.aborted) {
    return (
      <>
        <Title sub="ผู้คุมออกจากห้อง หรือผู้เล่นเหลือไม่พอ">รอบนี้จบก่อน</Title>
        {footer}
      </>
    )
  }
  const rows = Object.entries(res.deltas)
    .map(([id, d]) => ({ id, d, n: res.counts[id] }))
    .sort((a, b) => b.d - a.d)
  return (
    <>
      <Title tone="good">{name(res.guesser)} ทายถูก!</Title>
      <ul aria-label="ตัวเลือกทั้งหมด" className="mt-4 grid gap-2.5 lg:grid-cols-3 lg:gap-4">
        {res.options.map((id) => {
          const real = id === res.rule
          return (
            <li key={id} className={`flex items-start gap-3 rounded-[16px] p-3.5 ${real ? 'border-2 border-success bg-success/10' : 'border border-line bg-surface opacity-70'}`}>
              <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${real ? 'bg-success text-white' : 'bg-line'}`} aria-hidden="true">
                {real && '✓'}
              </span>
              <span>
                <span className="block font-bold lg:text-lg">{ikRule(id)?.text}</span>
                <span className={`block text-xs font-bold ${real ? 'text-success-ink' : 'text-ink-muted'}`}>{real ? `กฎจริง · ${name(res.guesser)} เลือกข้อนี้` : 'กฎหลอก'}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <section aria-label="คะแนนรอบนี้" className="mt-4 rounded-[18px] border border-line bg-surface px-4 py-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_56px_56px] gap-2 border-b border-line py-2 text-xs font-bold text-ink-muted">
          <span>ผู้เล่น</span>
          <span className="text-center">รอบนี้</span>
          <span className="text-right">รวม</span>
        </div>
        <ol>
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_56px_56px] items-center gap-2 border-b border-line/60 py-2 last:border-0">
              <span className="flex min-w-0 items-center gap-2.5">
                <ScoreAvatar p={byId(r.id)} />
                <span className="min-w-0">
                  <span className="block truncate font-bold">{name(r.id)}</span>
                  <span className="block text-xs text-ink-muted">{r.id === res.guesser ? 'ทายกฎถูก' : `เหลือ ${r.n} ใบ`}</span>
                </span>
              </span>
              <span className={`num text-center text-xl font-extrabold ${r.d > 0 ? 'text-success-ink' : r.d < 0 ? 'text-danger-ink' : 'text-ink-muted'}`}>{signed(r.d)}</span>
              <span className="num text-right text-lg font-extrabold">{signed(ik.scores[r.id] ?? 0)}</span>
            </li>
          ))}
          <li className="grid grid-cols-[minmax(0,1fr)_56px_56px] items-center gap-2 py-2">
            <span className="flex min-w-0 items-center gap-2.5">
              <ScoreAvatar p={byId(ik.keeper_id)} />
              <span className="min-w-0">
                <span className="block truncate font-bold">{name(ik.keeper_id)}</span>
                <span className="block text-xs text-ink-muted">ผู้คุม · ไม่คิดคะแนนรอบนี้</span>
              </span>
            </span>
            <span className="num text-center text-xl font-extrabold text-ink-muted">—</span>
            <span className="num text-right text-lg font-extrabold">{signed(ik.scores[ik.keeper_id ?? ''] ?? 0)}</span>
          </li>
        </ol>
      </section>
      {nextKeeper && (
        <p className="mt-3 text-center text-sm text-ink-muted">
          ผู้คุมรอบหน้า: <b className="text-ink">{name(nextKeeper.id)}</b>
        </p>
      )}
      {footer}
    </>
  )
}

function Final({ room, ik, isHost, hostName, name, byId }: Ctx) {
  const { busy, run } = useRun()
  const ranking = Object.entries(ik.scores)
    .filter(([id]) => byId(id))
    .sort((a, b) => b[1] - a[1])
  const top = ranking[0]?.[1]
  return (
    <>
      <Title sub="คะแนนรวมทั้งเกม">{ranking.length && ranking.filter((r) => r[1] === top).length === 1 ? `${name(ranking[0][0])} ชนะ!` : 'จบเกม'}</Title>
      <ol className="mx-auto mt-5 flex w-full max-w-xl flex-col gap-2">
        {ranking.map(([id, s], i) => (
          <li key={id} className={`flex items-center gap-3 rounded-[16px] border px-4 py-3 ${s === top ? 'border-2 border-[#E9B92F] bg-[#E9B92F]/10' : 'border-line bg-surface'}`}>
            <span className="num w-6 text-lg font-extrabold text-ink-muted">{i + 1}</span>
            <ScoreAvatar p={byId(id)} />
            <span className="min-w-0 flex-1 truncate font-bold">{name(id)}</span>
            <span className={`num text-xl font-extrabold ${s > 0 ? 'text-success-ink' : s < 0 ? 'text-danger-ink' : ''}`}>{signed(s)}</span>
          </li>
        ))}
      </ol>
      <BottomBar>
        {isHost ? (
          <>
            <PrimaryButton disabled={busy} onClick={() => run(() => api.ik.start(room))}>
              เล่นอีกเกม
            </PrimaryButton>
            <PrimaryButton variant="ghost" className="mx-auto underline underline-offset-4" disabled={busy} onClick={() => run(() => api.backToLobby(room))}>
              กลับล็อบบี้
            </PrimaryButton>
          </>
        ) : (
          <StatusLine>รอ {hostName} เริ่มเกมใหม่…</StatusLine>
        )}
      </BottomBar>
    </>
  )
}

export { RuleCard }
