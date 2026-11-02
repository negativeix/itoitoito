import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { sanitizeCode } from '../components/CodeInput'
import { NameField } from '../components/NameField'
import { PrimaryButton } from '../components/PrimaryButton'
import { ConnectionBanner, RoomHeader } from '../components/RoomHeader'
import { ThreadCoil } from '../components/ThreadCoil'
import { api } from '../lib/api'
import { savedName, saveName } from '../lib/name'
import { useRoomConnection } from '../lib/realtime'
import { ensureSession, isConfigured, supabase } from '../lib/supabase'
import { useWakeLock } from '../lib/wakeLock'
import { myPlayer, useRoom } from '../store/roomStore'
import { toast } from '../store/toastStore'
import { Lobby } from './Lobby'
import { Play } from './Play'
import { Result } from './Result'
import { Reveal } from './Reveal'
import { Topic } from './Topic'

type Gate = { kind: 'loading' } | { kind: 'join' } | { kind: 'in'; roomId: string } | { kind: 'error'; text: string }

/** /r/:code — joins (or rejoins) the room, then renders the screen for the current phase. */
export function RoomScreen() {
  const { code: rawCode = '' } = useParams()
  const code = sanitizeCode(rawCode)
  const navigate = useNavigate()
  const [gate, setGate] = useState<Gate>({ kind: 'loading' })
  const userId = useRoom((s) => s.userId)

  useEffect(() => {
    if (!isConfigured) {
      setGate({ kind: 'error', text: 'ยังไม่ได้เชื่อมเซิร์ฟเวอร์ (ตั้งค่า .env.local ก่อน)' })
      return
    }
    let cancelled = false
    useRoom.getState().reset()
    ;(async () => {
      try {
        const uid = await ensureSession()
        useRoom.getState().set({ userId: uid })
        // Members can read their room by code; anyone else has to join first.
        const { data: room } = await supabase.from('rooms').select('id').eq('code', code).maybeSingle()
        if (cancelled) return
        if (room) {
          const { data: me } = await supabase.from('players').select('left_at').eq('room_id', room.id).eq('user_id', uid).maybeSingle()
          if (cancelled) return
          if (me && !me.left_at) {
            setGate({ kind: 'in', roomId: room.id })
            return
          }
        }
        setGate({ kind: 'join' })
      } catch {
        if (!cancelled) setGate({ kind: 'error', text: 'ต่อเน็ตไม่ได้ ลองรีเฟรชอีกครั้งนะ' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  if (gate.kind === 'loading') {
    return (
      <Centered>
        <span className="num block text-[64px] leading-none font-bold tracking-[0.2em] text-ink">{code}</span>
        <span className="mt-3 block">กำลังเข้าห้อง…</span>
      </Centered>
    )
  }
  if (gate.kind === 'error') return <Centered action>{gate.text}</Centered>
  if (gate.kind === 'join') return <JoinGate code={code} onJoined={(roomId) => setGate({ kind: 'in', roomId })} />
  return <InRoom roomId={gate.roomId} userId={userId!} onExit={() => navigate('/')} />
}

function JoinGate({ code, onJoined }: { code: string; onJoined: (roomId: string) => void }) {
  const [name, setName] = useState(savedName)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const join = async () => {
    if (!name.trim()) {
      setError('ใส่ชื่อเล่นก่อนนะ')
      ref.current?.focus()
      return
    }
    setBusy(true)
    try {
      saveName(name)
      const r = await api.joinRoom(code, name)
      onJoined(r.room_id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="safe-x safe-top safe-bottom mx-auto flex min-h-dvh max-w-lg flex-col">
      <RoomHeader />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-ink-muted">เพื่อนชวนเข้าห้อง</p>
        <p className="num mt-1 text-[64px] leading-none font-bold tracking-[0.2em]">{code}</p>
        <ThreadCoil width={120} height={30} loops={3} draw className="mt-3 w-28" />
      </div>
      <div className="flex flex-col gap-3">
        <NameField ref={ref} value={name} error={error} onChange={(v) => (setName(v), setError(null))} onEnter={join} />
        <PrimaryButton onClick={join} disabled={busy}>
          {busy ? 'กำลังเข้าห้อง…' : 'เข้าห้อง'}
        </PrimaryButton>
        <Link to="/" className="mx-auto inline-flex min-h-12 items-center text-ink-muted underline underline-offset-4">
          กลับหน้าแรก
        </Link>
      </div>
    </main>
  )
}

function InRoom({ roomId, userId, onExit }: { roomId: string; userId: string; onExit: () => void }) {
  useRoomConnection(roomId, userId)
  useWakeLock(true)
  useHostMigration()

  const room = useRoom((s) => s.room)
  const me = useRoom(myPlayer)
  const connection = useRoom((s) => s.connection)
  const removed = useRoom((s) => s.removed)
  const isHost = !!room && room.host_user_id === userId
  const prevHost = useRef<string | null>(null)

  useEffect(() => {
    if (!removed) return
    toast('คุณไม่ได้อยู่ในห้องนี้แล้ว')
    useRoom.getState().reset()
    onExit()
  }, [removed, onExit])

  // Let the new host know they're in charge.
  useEffect(() => {
    if (!room) return
    if (prevHost.current && prevHost.current !== room.host_user_id && room.host_user_id === userId) toast('ตอนนี้คุณเป็นเจ้าของห้องแล้ว')
    prevHost.current = room.host_user_id
  }, [room, userId])

  const leave = async () => {
    try {
      await api.leaveRoom(roomId)
    } catch {
      // Leaving should always get the user out, even offline.
    }
    useRoom.getState().reset()
    onExit()
  }

  if (!room || !me) return <Centered>กำลังโหลดห้อง…</Centered>

  const menu = (
    <div className="flex flex-col gap-3 pb-2">
      {isHost && room.status !== 'lobby' && (
        <PrimaryButton variant="secondary" onClick={() => api.backToLobby(roomId).catch((e) => toast(e.message, 'error'))}>
          กลับล็อบบี้ (จบเกมนี้)
        </PrimaryButton>
      )}
      <PrimaryButton variant="secondary" onClick={leave}>
        ออกจากห้อง
      </PrimaryButton>
    </div>
  )

  let screen
  switch (room.status) {
    case 'lobby':
      screen = <Lobby />
      break
    case 'choosing_theme':
      screen = <Topic />
      break
    case 'placing':
      screen = <Play />
      break
    case 'revealing':
      screen = <Reveal />
      break
    default:
      screen = <Result />
  }

  return (
    <main className="safe-x safe-top mx-auto flex min-h-dvh max-w-lg flex-col">
      <ConnectionBanner show={connection === 'reconnecting'} />
      <RoomHeader code={room.code} menu={menu} />
      <fieldset disabled={connection === 'reconnecting'} className="contents">
        {screen}
      </fieldset>
    </main>
  )
}

/** Host gone from presence > 20 s → the lowest-seat online player asks the server to take over (§4.6). */
function useHostMigration() {
  useEffect(() => {
    let missingSince: number | null = null
    let inflight = false
    const timer = setInterval(() => {
      const s = useRoom.getState()
      const r = s.room
      if (!r || s.connection !== 'online' || !s.userId || !s.online.includes(s.userId)) {
        missingSince = null
        return
      }
      if (s.online.includes(r.host_user_id)) {
        missingSince = null
        return
      }
      missingSince ??= Date.now()
      if (Date.now() - missingSince < 20_000 || inflight) return
      const next = s.players
        .filter((p) => !p.left_at && p.user_id !== r.host_user_id && s.online.includes(p.user_id))
        .sort((a, b) => Number(a.spectating) - Number(b.spectating) || a.seat - b.seat)[0]
      if (next?.user_id !== s.userId) return
      inflight = true
      api
        .transferHost(r.id)
        .catch(() => {})
        .finally(() => {
          inflight = false
          missingSince = Date.now()
        })
    }, 2000)
    return () => clearInterval(timer)
  }, [])
}

function Centered({ children, action = false }: { children: React.ReactNode; action?: boolean }) {
  return (
    <main className="safe-x safe-top safe-bottom mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 text-center">
      <ThreadCoil width={120} height={30} loops={3} draw className="w-28" />
      <p className="text-lg text-ink-muted" role="status">
        {children}
      </p>
      {action && (
        <Link to="/" className="inline-flex min-h-12 items-center font-bold text-thread-ink underline underline-offset-4">
          กลับหน้าแรก
        </Link>
      )}
    </main>
  )
}
