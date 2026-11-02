import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <main className="safe-x safe-top safe-bottom mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center text-center">
      <p className="num text-3xl font-bold">?</p>
      <h1 className="mt-2 text-xl font-bold">ไม่เจอหน้านี้</h1>
      <p className="mt-1 text-ink-muted">ลิงก์อาจผิด หรือหน้านี้ถูกย้ายไปแล้ว</p>
      <Link to="/" className="mt-6 inline-flex min-h-12 items-center font-bold text-thread-ink underline underline-offset-4">
        กลับหน้าแรก
      </Link>
    </main>
  )
}
