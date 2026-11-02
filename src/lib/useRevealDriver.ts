import { useEffect } from 'react'
import { useRoom } from '../store/roomStore'
import { api } from './api'
import { loadSnapshot } from './realtime'

const FIRST_DELAY = 1200
const STEP_DELAY = 900
const FALLBACK_DELAY = 3500

/**
 * Drives the reveal (§4.4). The host calls reveal_next every ~900 ms; if the host is offline,
 * the lowest-seat online player drives instead. Everyone else acts as a slow fallback, which is
 * safe because reveal_next is idempotent on expected_index.
 */
export function useRevealDriver() {
  const roomId = useRoom((s) => s.room?.id)
  const status = useRoom((s) => s.room?.status)
  const index = useRoom((s) => s.room?.reveal_index ?? -1)
  const hostId = useRoom((s) => s.room?.host_user_id)
  const userId = useRoom((s) => s.userId)
  const online = useRoom((s) => s.online)
  const players = useRoom((s) => s.players)

  const hostOnline = !!hostId && online.includes(hostId)
  const fallbackDriver = players
    .filter((p) => !p.left_at && online.includes(p.user_id))
    .sort((a, b) => Number(a.spectating) - Number(b.spectating) || a.seat - b.seat)[0]?.user_id
  const driver = hostOnline ? hostId === userId : fallbackDriver === userId

  useEffect(() => {
    if (!roomId || status !== 'revealing') return
    const delay = driver ? (index < 0 ? FIRST_DELAY : STEP_DELAY) : FALLBACK_DELAY
    let check = 0
    const timer = window.setTimeout(() => {
      api
        .revealNext(roomId, index)
        .then((next) => {
          // If the realtime update is slow or lost, resync so the loop keeps going.
          check = window.setTimeout(() => {
            if ((useRoom.getState().room?.reveal_index ?? -1) < next) void loadSnapshot(roomId)
          }, 1200)
        })
        .catch(() => void loadSnapshot(roomId))
    }, delay)
    return () => {
      clearTimeout(timer)
      clearTimeout(check)
    }
  }, [roomId, status, index, driver])
}
