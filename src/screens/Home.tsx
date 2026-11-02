import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CodeInput } from '../components/CodeInput'
import { NameField } from '../components/NameField'
import { PrimaryButton } from '../components/PrimaryButton'
import { MuteButton } from '../components/RoomHeader'
import { Sheet } from '../components/Sheet'
import { ThreadCoil } from '../components/ThreadCoil'
import { savedName, saveName } from '../lib/name'
import { isConfigured } from '../lib/env'
import { toast } from '../store/toastStore'

// The Supabase SDK is loaded on demand so the home screen paints without it.
const backend = () => Promise.all([import('../lib/api'), import('../lib/supabase')]).then(([a, s]) => ({ api: a.api, ensureSession: s.ensureSession }))

export function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState(savedName)
  const [nameError, setNameError] = useState<string | null>(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [resume, setResume] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isConfigured) return
    const load = () =>
      backend()
        .then(async ({ api, ensureSession }) => {
          await ensureSession()
          return api.myRoom()
        })
        .then((r) => setResume(r?.code ?? null))
        .catch(() => {})
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300))
    idle(load)
  }, [])

  const requireName = () => {
    if (name.trim()) return true
    setNameError('ใส่ชื่อเล่นก่อนนะ')
    nameRef.current?.focus()
    return false
  }

  const create = async () => {
    if (!requireName()) return
    setBusy('create')
    try {
      saveName(name)
      const { api, ensureSession } = await backend()
      await ensureSession()
      const r = await api.createRoom(name)
      navigate(`/r/${r.code}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const join = async (c = code) => {
    if (c.length !== 4) return
    if (!name.trim()) {
      setJoinOpen(false)
      requireName()
      return
    }
    setBusy('join')
    try {
      saveName(name)
      const { api, ensureSession } = await backend()
      await ensureSession()
      const r = await api.joinRoom(c, name)
      navigate(`/r/${r.code}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="safe-x safe-top safe-bottom mx-auto flex min-h-dvh max-w-lg flex-col">
      <div className="-mr-3 flex justify-end">
        <MuteButton />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
        <h1 className="num text-[96px] leading-none font-bold tracking-tight">ito</h1>
        <ThreadCoil width={160} height={40} loops={4} draw className="mt-2 w-40" />
        <p className="mt-4 text-lg text-ink-muted">ร้อยความคิดให้ตรงกัน</p>
      </div>

      {!isConfigured ? (
        <div className="mb-6 rounded-btn border border-line bg-surface p-4 text-left text-sm text-ink-muted">
          <p className="font-bold text-ink">ยังไม่ได้เชื่อมเซิร์ฟเวอร์</p>
          <p>ใส่ค่า VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ในไฟล์ .env.local แล้วรันใหม่อีกครั้ง</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-2">
          {resume && (
            <Link
              to={`/r/${resume}`}
              className="flex min-h-14 items-center justify-between rounded-btn border-2 border-thread bg-surface px-4 font-bold text-thread-ink"
            >
              <span>กลับเข้าห้องเดิม</span>
              <span className="num tracking-widest">{resume}</span>
            </Link>
          )}
          <NameField
            ref={nameRef}
            value={name}
            error={nameError}
            onChange={(v) => {
              setName(v)
              setNameError(null)
            }}
            onEnter={create}
          />
          <PrimaryButton onClick={create} disabled={busy !== null}>
            {busy === 'create' ? 'กำลังสร้างห้อง…' : 'สร้างห้อง'}
          </PrimaryButton>
          <PrimaryButton variant="secondary" onClick={() => setJoinOpen(true)} disabled={busy !== null}>
            เข้าห้อง
          </PrimaryButton>
          <Link to="/how" className="mx-auto inline-flex min-h-12 items-center px-4 text-ink-muted underline underline-offset-4">
            วิธีเล่น
          </Link>
        </div>
      )}

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} title="เข้าห้อง">
        <p className="mb-4 text-ink-muted">กรอกโค้ด 4 ตัวจากเพื่อน หรือสแกน QR ในห้องของเพื่อน</p>
        <CodeInput value={code} onChange={setCode} onComplete={(c) => void join(c)} />
        <PrimaryButton className="mt-6" onClick={() => void join()} disabled={code.length !== 4 || busy !== null}>
          {busy === 'join' ? 'กำลังเข้าห้อง…' : 'เข้าห้อง'}
        </PrimaryButton>
        <div className="h-2" />
      </Sheet>
    </main>
  )
}
