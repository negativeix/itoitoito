import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { IconBack } from '../components/icons'
import { PrimaryButton } from '../components/PrimaryButton'
import { MuteButton } from '../components/RoomHeader'
import { ScaleLine } from '../components/TopicBar'
import { PLAYER_COLORS } from '../lib/players'

type Slide = { title: string; body: string; art: ReactNode }

const c = (i: number) => PLAYER_COLORS[i].hex

const SLIDES: Slide[] = [
  {
    title: 'ทุกคนได้เลขลับ 1–100',
    body: 'กดค้างที่การ์ดเพื่อแอบดูเลขของตัวเอง ห้ามให้ใครเห็น',
    art: (
      <div className="flex items-end justify-center gap-3">
        <Card color={c(0)} initials="บ" className="w-20 -rotate-6" />
        <Card value={64} faceUp color={c(5)} initials="ฉ" mine className="w-28" />
        <Card color={c(3)} initials="ม" className="w-20 rotate-6" />
      </div>
    ),
  },
  {
    title: 'ตอบตามหัวข้อ ห้ามบอกเลข',
    body: 'เช่น หัวข้อ "ความเผ็ดของอาหาร" ถ้าได้ 64 อาจพูดว่า "ต้มยำ" แล้วพิมพ์เป็นคำใบ้ได้',
    art: (
      <div className="w-full max-w-xs rounded-btn border border-line bg-surface p-4 shadow-card">
        <p className="font-bold">ความเผ็ดของอาหาร</p>
        <ScaleLine low="ไม่เผ็ดเลย" high="เผ็ดจนน้ำตาไหล" compact />
        <div className="mt-4 flex justify-center">
          <span className="rotate-[-2deg] rounded-[6px] border border-line bg-bg px-3 py-1 text-lg">"ต้มยำ"</span>
        </div>
      </div>
    ),
  },
  {
    title: 'ช่วยกันเรียงจากน้อยไปมาก',
    body: 'ลากการ์ดคว่ำของตัวเองขึ้นไปวางบนโต๊ะ ต่อจากการ์ด 0 คุยกันแล้วย้ายได้เรื่อยๆ ครบแล้วกด "มั่นใจแล้ว"',
    art: (
      <div className="flex items-start justify-center gap-2">
        <Card zero className="w-16" />
        <Card color={c(3)} initials="ม" className="w-16" />
        <Card color={c(5)} initials="ฉ" mine className="w-16" />
        <Card color={c(0)} initials="บ" className="w-16" />
      </div>
    ),
  },
  {
    title: 'เปิดการ์ด — ร้อยด้ายให้ครบ!',
    body: 'เปิดทีละใบจากซ้าย ใบไหนน้อยกว่าใบที่เปิดไปก่อนหน้า ด้ายจะขาดตรงนั้น',
    art: (
      <div className="flex items-start justify-center gap-2">
        <Card zero className="w-16" />
        <Card value={18} faceUp color={c(3)} initials="ม" className="w-16" />
        <Card value={64} faceUp color={c(5)} initials="ฉ" className="w-16" />
        <Card value={51} faceUp wrong color={c(0)} initials="บ" className="w-16" />
      </div>
    ),
  },
]

/** 4 swipeable slides (§3.7) — used on /how and inside the in-room help sheet. */
export function HowTo({ onDone }: { onDone?: () => void }) {
  const [[index, dir], setIndex] = useState<[number, number]>([0, 0])
  const go = (next: number) => setIndex([Math.max(0, Math.min(SLIDES.length - 1, next)), next > index ? 1 : -1])
  const slide = SLIDES[index]
  const last = index === SLIDES.length - 1

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60) go(index + 1)
    else if (info.offset.x > 60) go(index - 1)
  }

  return (
    <div className="pb-2">
      <div className="relative h-[340px] overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={index}
            custom={dir}
            className="absolute inset-0 flex touch-pan-y flex-col items-center"
            initial={{ x: dir * 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir * -300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 36 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.4}
            onDragEnd={onDragEnd}
          >
            <div className="flex h-48 w-full items-center justify-center">{slide.art}</div>
            <p className="num mt-2 text-sm font-bold text-thread-ink">
              {index + 1}/{SLIDES.length}
            </p>
            <h2 className="mt-1 text-center text-xl font-bold">{slide.title}</h2>
            <p className="mt-1 text-center text-ink-muted">{slide.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="my-4 flex justify-center gap-2" role="tablist" aria-label="สไลด์">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`สไลด์ ${i + 1}`}
            onClick={() => go(i)}
            className="grid size-8 place-items-center"
          >
            <span className={`block h-2 rounded-full transition-all ${i === index ? 'w-6 bg-thread' : 'w-2 bg-line'}`} />
          </button>
        ))}
      </div>

      {last && (
        <div className="mb-4 rounded-btn border border-line bg-bg p-3 text-sm text-ink-muted">
          <p className="font-bold text-ink">โหมดท้าทาย (Level Up) · กติกาเสริม</p>
          <p>
            กติกาที่เราออกแบบเพิ่มเอง: เริ่ม 3 หัวใจ เลเวล 1 ได้คนละ 1 ใบ เลเวล 2 ได้ 2 ใบ ไปเรื่อยๆ ผิด 1 ใบเสีย 1 หัวใจ ผ่านแบบไม่ผิดเลยได้หัวใจคืน 1
            (สูงสุด 3) หัวใจหมดคือจบเกม
          </p>
        </div>
      )}

      <PrimaryButton onClick={() => (last ? onDone?.() : go(index + 1))}>{last ? 'เข้าใจแล้ว' : 'ถัดไป'}</PrimaryButton>
    </div>
  )
}

export function HowToPage() {
  return (
    <main className="safe-x safe-top safe-bottom mx-auto min-h-dvh max-w-lg">
      <header className="flex h-12 items-center justify-between">
        <Link to="/" className="-ml-3 grid size-12 place-items-center text-ink-muted" aria-label="กลับหน้าแรก">
          <IconBack />
        </Link>
        <h1 className="text-lg font-bold">วิธีเล่น</h1>
        <div className="-mr-3">
          <MuteButton />
        </div>
      </header>
      <div className="mt-4">
        <HowToDoneLink />
      </div>
    </main>
  )
}

function HowToDoneLink() {
  const [done, setDone] = useState(false)
  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-xl font-bold">พร้อมแล้ว ไปชวนเพื่อนกัน!</p>
        <Link to="/" className="inline-flex h-14 w-full items-center justify-center rounded-btn bg-thread text-lg font-bold text-white shadow-card">
          ไปหน้าแรก
        </Link>
      </div>
    )
  }
  return <HowTo onDone={() => setDone(true)} />
}
