import type { ReactNode } from 'react'
import { AnimalCard, HandFan, RuleCard } from '../../components/iknow/AnimalCard'
import { ikRule } from '../../data/iknowRules'
import { signed, type IkState } from '../../lib/iknow'
import { initialOf, inkOn } from '../../lib/players'
import type { Player } from '../../lib/types'

// Building blocks shared by the ใครไม่รู้ screens.

export type Who = { me: Player; players: Player[]; ik: IkState; byId: (id: string | null | undefined) => Player | undefined }

/** Next player by seat after `after`, skipping `skip` (mirrors _ik_next on the server). */
export function nextBySeat(players: Player[], after: string | null, skip: (string | null)[]): Player | undefined {
  const list = players.filter((p) => !p.left_at && !p.spectating && !skip.includes(p.id)).sort((a, b) => a.seat - b.seat)
  const seat = players.find((p) => p.id === after)?.seat ?? -1
  return list.find((p) => p.seat > seat) ?? list[0]
}

function statusOf(p: Player, ik: IkState): { sub: string; tone: 'turn' | 'busy' | '' } {
  if (p.id === ik.keeper_id) return { sub: '', tone: '' }
  if (ik.phase === 'turn' && p.id === ik.turn_id) return { sub: 'กำลังเรียง', tone: 'turn' }
  if (ik.phase === 'judging' && p.id === ik.turn_id) return { sub: 'ส่งให้ผู้คุมแล้ว', tone: 'busy' }
  if (ik.phase === 'checking' && p.id === ik.check_id) return { sub: 'ให้ผู้คุมเช็กมือ', tone: 'busy' }
  if (ik.phase === 'guessing' && p.id === ik.guesser_id) return { sub: 'กำลังทาย', tone: 'turn' }
  return { sub: '', tone: '' }
}

function ScorePill({ score }: { score: number }) {
  const tone = score > 0 ? 'bg-[#1F7A4D] text-white' : score < 0 ? 'bg-[#B8262B] text-white' : 'bg-line text-ink'
  return (
    <span
      className={`num absolute -right-2 -bottom-1.5 flex h-[18px] min-w-[22px] items-center justify-center rounded-full border-2 border-bg px-1 text-[10px] leading-none font-extrabold ${tone}`}
      aria-label={`คะแนนรวม ${signed(score)}`}
    >
      {signed(score)}
    </span>
  )
}

function Avatar({ p, score, ring, size = 38 }: { p: Player; score: number; ring?: string; size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-full font-bold"
      style={{ width: size, height: size, background: p.color, color: inkOn(p.color), boxShadow: ring ? `0 0 0 3px var(--bg), 0 0 0 5px ${ring}` : undefined }}
    >
      <span aria-hidden="true">{initialOf(p.name)}</span>
      <ScorePill score={score} />
    </span>
  )
}

/** Mobile: a row of avatars with score, name and cards in hand. */
export function PlayerStrip({ me, players, ik }: Who) {
  const list = players.filter((p) => !p.left_at && !p.spectating)
  return (
    <ul aria-label="ผู้เล่น" className="mt-2 flex justify-between gap-1 lg:hidden">
      {list.map((p) => {
        const st = statusOf(p, ik)
        return (
          <li key={p.id} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            <Avatar p={p} score={ik.scores[p.id] ?? 0} ring={st.tone === 'turn' ? 'var(--thread)' : st.tone === 'busy' ? '#7C4DDB' : undefined} />
            <span className={`w-full truncate text-center text-xs ${p.id === me.id ? 'font-bold' : ''}`}>{p.id === me.id ? 'คุณ' : p.name}</span>
            {p.id === ik.keeper_id ? (
              <span className="rounded-full bg-[#4B2E83] px-2 text-[10px] leading-relaxed font-bold text-white">ผู้คุม</span>
            ) : (
              <HandFan count={ik.hand_counts[p.id] ?? 0} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Desktop sidebar: the same information as a list. */
export function PlayerList({ me, players, ik }: Who) {
  const list = players.filter((p) => !p.left_at && !p.spectating)
  return (
    <section aria-label="ผู้เล่น" className="rounded-[18px] border border-line bg-surface p-2">
      <ol className="flex flex-col gap-0.5">
        {list.map((p) => {
          const st = statusOf(p, ik)
          return (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${st.tone === 'turn' ? 'bg-thread/10' : st.tone === 'busy' ? 'bg-[#7C4DDB]/10' : ''}`}
            >
              <Avatar p={p} score={ik.scores[p.id] ?? 0} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{p.id === me.id ? `${p.name} (คุณ)` : p.name}</span>
                {st.sub && <span className={`block text-xs font-medium ${st.tone === 'turn' ? 'text-thread-ink' : 'text-[#5B34B0]'}`}>{st.sub}</span>}
              </span>
              {p.id === ik.keeper_id ? (
                <span className="rounded-full bg-[#4B2E83] px-2 py-0.5 text-[11px] font-bold text-white">ผู้คุม</span>
              ) : (
                <HandFan count={ik.hand_counts[p.id] ?? 0} size="md" />
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Pinned bar: the keeper sees the rule (and can hide it), everyone else sees who keeps it. */
export function RuleBar({ ik, isKeeper, keeperName, ruleId, hidden, onToggle }: { ik: IkState; isKeeper: boolean; keeperName: string; ruleId: number | null | undefined; hidden: boolean; onToggle: () => void }) {
  const rule = ikRule(ruleId)
  if (isKeeper && rule) {
    return (
      <div className="flex items-center gap-3 rounded-[16px] border-2 border-[#1d1b18] bg-[#4B2E83] px-3 py-2 text-white shadow-[0_3px_0_#1d1b18]">
        <span className="shrink-0 text-xs font-bold text-[#E6DDF5]">กฎลับ</span>
        <p className="min-w-0 flex-1 rounded-[10px] bg-[#FFFBF3] px-2.5 py-1.5 font-bold text-[#1d1b18]">{hidden ? '••••••••' : rule.text}</p>
        <button type="button" onClick={onToggle} className="min-h-10 shrink-0 rounded-full border border-white/40 px-3 text-xs font-bold">
          {hidden ? 'ดู' : 'ซ่อน'}
        </button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-line bg-surface px-3 py-2">
      <span
        className="grid h-9 w-6 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-[#1d1b18] font-[Fraunces] text-sm font-extrabold text-white"
        style={{ background: 'repeating-linear-gradient(135deg, #4B2E83 0 5px, #3A2366 5px 10px)' }}
        aria-hidden="true"
      >
        ?
      </span>
      <p className="min-w-0 flex-1 truncate font-bold">กฎลับรอบนี้ · ผู้คุม {keeperName}</p>
      <span className="num shrink-0 text-xs text-ink-muted">รอบ {ik.round}</span>
    </div>
  )
}

/** Accepted cards in table order, wrapping into rows; the latest has a red ring. */
export function TableGrid({ cards, children, dense }: { cards: number[]; children?: ReactNode; dense?: boolean }) {
  const many = cards.length > 24
  return (
    <section aria-label="โต๊ะ" className="rounded-[20px] bg-surface-2 p-2.5 lg:p-4">
      <p className="mb-2 px-0.5 text-xs font-bold text-ink-muted">โต๊ะ · {cards.length} ใบ</p>
      <div className={`grid gap-x-1 gap-y-2 lg:gap-x-2.5 lg:gap-y-3 ${many ? 'grid-cols-7' : 'grid-cols-6'} ${dense ? 'lg:grid-cols-14' : 'lg:grid-cols-11 xl:grid-cols-12'}`}>
        {cards.map((c, i) => (
          <AnimalCard key={`${c}-${i}`} card={c} ring={i === cards.length - 1 ? 'var(--thread)' : undefined} />
        ))}
        {children}
      </div>
    </section>
  )
}

export function RejectedList({ ik, byId, limit }: { ik: IkState; byId: Who['byId']; limit?: number }) {
  const list = [...ik.rejected].reverse().slice(0, limit)
  if (!list.length) return <p className="text-sm text-ink-muted">ยังไม่มีชุดที่ไม่ผ่าน</p>
  return (
    <ul className="flex flex-col gap-2.5">
      {list.map((r, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-1 w-20 shrink-0 truncate text-xs text-ink-muted">
            {byId(r.p)?.name ?? 'ผู้เล่น'} · ตา {r.t}
          </span>
          {/* Long sets wrap onto more rows instead of running out of the box. */}
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {r.cards.map((c) => (
              <AnimalCard key={c} card={c} className="w-8" faded cross />
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function RuleOption({ ruleId, children, className = '' }: { ruleId: number; children?: ReactNode; className?: string }) {
  const r = ikRule(ruleId)
  return (
    <span className={`block ${className}`}>
      <span className="block font-bold">{r?.text ?? `กฎ #${ruleId}`}</span>
      {children}
    </span>
  )
}

export { RuleCard }
