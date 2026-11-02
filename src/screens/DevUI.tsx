import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { PrimaryButton } from '../components/PrimaryButton'
import { Sheet } from '../components/Sheet'
import { ThreadCoil } from '../components/ThreadCoil'
import { PLAYER_COLORS, initialOf, inkOn } from '../lib/players'
import { applyThemePref, getThemePref, type ThemePref } from '../lib/theme'
import { usePressHold } from '../lib/usePressHold'

const TOKENS = ['bg', 'surface', 'surface-2', 'ink', 'ink-muted', 'thread', 'success', 'danger', 'line'] as const
const SAMPLE_NAMES = ['บอส', 'มิ้นท์', 'เจ', 'ไอซ์', 'แพร', 'ต้น', 'Nina', 'โอ๊ต', 'ฝน', 'เก่ง']
const TYPE_SCALE = [12, 14, 16, 20, 24, 32, 48] as const

const randomValue = () => 1 + Math.floor(Math.random() * 100)

/** Component gallery for phase 0 device testing (ITO_PLAN §6). */
export function DevUI() {
  const [theme, setTheme] = useState<ThemePref>(getThemePref)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [allUp, setAllUp] = useState(false)
  const [lifted, setLifted] = useState(false)
  const [secret, setSecret] = useState(randomValue)
  const { held, bind } = usePressHold()

  useEffect(() => applyThemePref(theme), [theme])

  return (
    <main className="safe-x safe-top mx-auto max-w-lg pb-40">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">ชุดดีไซน์ · ด้ายแดง</h1>
          <p className="text-sm text-ink-muted">หน้าทดสอบ component สำหรับเฟส 0</p>
        </div>
        <Link to="/" className="inline-flex min-h-12 items-center text-sm text-ink-muted underline underline-offset-4">
          หน้าแรก
        </Link>
      </header>

      <Section title="ธีม">
        <div className="grid grid-cols-3 gap-1 rounded-btn bg-surface-2 p-1" role="radiogroup" aria-label="ธีม">
          {(
            [
              ['auto', 'ตามเครื่อง'],
              ['light', 'สว่าง'],
              ['dark', 'โต๊ะกลางคืน'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={`min-h-12 rounded-[12px] text-sm font-bold transition-colors ${
                theme === value ? 'bg-surface text-ink shadow-card' : 'text-ink-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="กดค้างเพื่อดูเลข">
        <div className="flex flex-col items-center gap-4 rounded-card bg-surface-2 py-8">
          <div
            {...bind}
            role="button"
            tabIndex={0}
            aria-label="การ์ดของฉัน กดค้างเพื่อดูเลข"
            className="no-callout cursor-pointer touch-none"
          >
            <Card value={secret} faceUp={held} color={PLAYER_COLORS[5].hex} initials="ฉ" className="w-48" />
          </div>
          <p className="text-sm text-ink-muted" aria-live="polite">
            {held ? 'ปล่อยนิ้วเพื่อคว่ำการ์ด' : 'กดค้างที่การ์ดเพื่อดูเลข · สลับแอปแล้วเลขต้องหายทันที'}
          </p>
          <PrimaryButton variant="ghost" onClick={() => setSecret(randomValue())}>
            สุ่มเลขใหม่
          </PrimaryButton>
        </div>
      </Section>

      <Section title="การ์ด">
        <div className="flex flex-wrap gap-x-3 gap-y-6">
          <Card zero className="w-24" />
          <Card color={PLAYER_COLORS[0].hex} initials="บ" className="w-24" />
          <Card color={PLAYER_COLORS[2].hex} initials="ม" className="w-24" mine />
          <Card value={1} faceUp color={PLAYER_COLORS[3].hex} initials="จ" className="w-24" />
          <Card value={42} faceUp color={PLAYER_COLORS[6].hex} initials="ไ" className="w-24" />
          <Card value={100} faceUp color={PLAYER_COLORS[9].hex} initials="ต" className="w-24" />
          <Card value={37} faceUp wrong color={PLAYER_COLORS[7].hex} initials="แ" className="w-24" label="การ์ดเลข 37 วางผิด" />
          <Card color={PLAYER_COLORS[4].hex} initials="N" className="w-24" lifted={lifted} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <PrimaryButton variant="secondary" onClick={() => setAllUp((v) => !v)}>
            {allUp ? 'คว่ำทั้งหมด' : 'พลิกทั้งหมด'}
          </PrimaryButton>
          <PrimaryButton variant="secondary" onClick={() => setLifted((v) => !v)}>
            {lifted ? 'วางลง' : 'ยกการ์ด'}
          </PrimaryButton>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {[12, 58, 73, 91, 5, 100].map((v, i) => (
            <Card key={v} value={v} faceUp={allUp} color={PLAYER_COLORS[i].hex} initials={initialOf(SAMPLE_NAMES[i])} className="w-[calc((100%-36px)/4)]" />
          ))}
        </div>
      </Section>

      <Section title="ปุ่ม">
        <div className="flex flex-col gap-3">
          <PrimaryButton>มั่นใจแล้ว</PrimaryButton>
          <PrimaryButton disabled>วางการ์ดให้ครบก่อน</PrimaryButton>
          <PrimaryButton variant="secondary" onClick={() => setSheetOpen(true)}>
            เข้าห้อง
          </PrimaryButton>
          <PrimaryButton variant="ghost">วิธีเล่น</PrimaryButton>
        </div>
      </Section>

      <Section title="สี">
        <div className="grid grid-cols-3 gap-2">
          {TOKENS.map((t) => (
            <div key={t} className="overflow-hidden rounded-[12px] border border-line bg-surface">
              <div className="h-12" style={{ background: `var(--${t})` }} />
              <p className="px-2 py-1 text-xs text-ink-muted">--{t}</p>
            </div>
          ))}
        </div>
        <h3 className="mt-6 mb-2 text-sm font-bold text-ink-muted">สีผู้เล่น (คู่กับอักษรย่อเสมอ)</h3>
        <ul className="grid grid-cols-5 gap-3">
          {PLAYER_COLORS.map((c, i) => (
            <li key={c.hex} className="flex flex-col items-center gap-1">
              <span
                className="grid size-12 place-items-center rounded-full text-lg font-bold"
                style={{ background: c.hex, color: inkOn(c.hex) }}
                aria-hidden="true"
              >
                {initialOf(SAMPLE_NAMES[i])}
              </span>
              <span className="text-xs text-ink-muted">{c.name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="ตัวอักษร">
        <div className="flex flex-col gap-2">
          {TYPE_SCALE.map((size) => (
            <p key={size} style={{ fontSize: size }} className="truncate">
              <span className="num mr-2 text-ink-muted">{size}</span>ร้อยความคิดให้ตรงกัน
            </p>
          ))}
          <p className="num text-4xl font-bold">87</p>
          <p className="text-sm text-ink-muted">ทดสอบสระลอย: ปู่ป้ำน้ำท่วม ญี่ปุ่นฟุ้งซ่าน ฎีกาฐานะ</p>
        </div>
      </Section>

      <Section title="ด้ายแดง">
        <div className="rounded-card bg-surface-2 p-4">
          <ThreadCoil key={String(sheetOpen)} width={200} height={40} loops={5} draw className="w-full" />
        </div>
      </Section>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="เข้าห้อง">
        <p className="mb-4 text-ink-muted">กรอกโค้ดห้อง 4 ตัวจากเพื่อน (ตัวอย่าง sheet — ยังไม่เชื่อมระบบ)</p>
        <div className="mb-6 grid grid-cols-4 gap-2">
          {['A', 'B', 'C', 'D'].map((ch) => (
            <div key={ch} className="num grid h-16 place-items-center rounded-btn border-2 border-line bg-bg text-2xl font-bold">
              {ch}
            </div>
          ))}
        </div>
        <PrimaryButton onClick={() => setSheetOpen(false)}>เข้าห้อง</PrimaryButton>
        <PrimaryButton variant="ghost" className="mt-2 w-full" onClick={() => setSheetOpen(false)}>
          ยกเลิก
        </PrimaryButton>
      </Sheet>
    </main>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}
