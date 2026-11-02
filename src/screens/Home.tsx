import { Link } from 'react-router-dom'
import { ThreadCoil } from '../components/ThreadCoil'

/** Placeholder until phase 1 (rooms & lobby). */
export function Home() {
  return (
    <main className="safe-x safe-top safe-bottom mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center text-center">
      <h1 className="num text-[96px] leading-none font-bold tracking-tight">ito</h1>
      <ThreadCoil width={160} height={40} loops={4} draw className="mt-2 w-40" />
      <p className="mt-4 text-lg text-ink-muted">ร้อยความคิดให้ตรงกัน</p>
      <p className="mt-10 rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink-muted">
        กำลังเตรียมห้องเล่น อีกไม่นานเจอกัน
      </p>
      <Link to="/dev/ui" className="mt-6 inline-flex min-h-12 items-center text-ink-muted underline underline-offset-4">
        ดูชุดดีไซน์
      </Link>
    </main>
  )
}
