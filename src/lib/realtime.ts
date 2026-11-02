import type { RealtimeChannel } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { useRoom } from '../store/roomStore'
import { toast } from '../store/toastStore'
import { api } from './api'
import { supabase } from './supabase'
import type { BoardCard, HandCard, Player, Room } from './types'

let channel: RealtimeChannel | null = null
let lastDragSent = 0

/** Ghost preview of my drag for everyone else (§4.5), throttled to 50 ms. index null = drag ended. */
export function sendDrag(cardId: string, index: number | null) {
  const now = Date.now()
  if (index !== null && now - lastDragSent < 50) return
  lastDragSent = now
  void channel?.send({ type: 'broadcast', event: 'drag', payload: { card_id: cardId, index } })
}

/** Full snapshot of the room: used on join, on every (re)subscribe, and when the page wakes up. */
export async function loadSnapshot(roomId: string) {
  const store = useRoom.getState()
  const [r, p, b, h] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
    supabase.from('players').select('*').eq('room_id', roomId).order('seat'),
    supabase.from('board_cards').select('*').eq('room_id', roomId),
    supabase.from('hands').select('card_id, round, value').eq('room_id', roomId),
  ])
  if (r.error || p.error || b.error || h.error) {
    store.set({ connection: 'reconnecting' })
    return
  }
  const players = (p.data ?? []) as Player[]
  const me = players.find((x) => x.user_id === store.userId)
  if (!r.data || !me || me.left_at) {
    store.set({ removed: true })
    return
  }
  store.setSnapshot({ room: r.data as Room, players, board: (b.data ?? []) as BoardCard[], hand: (h.data ?? []) as HandCard[] })
}

/** Subscribes to a room: Postgres changes, presence, drag broadcast, heartbeats, reconnect (§4.5). */
export function useRoomConnection(roomId: string | null, userId: string | null) {
  useEffect(() => {
    if (!roomId || !userId) return
    const store = useRoom.getState
    let disposed = false

    const refresh = () => {
      if (!disposed) void loadSnapshot(roomId)
    }
    const beat = () => {
      if (document.visibilityState === 'visible') void api.heartbeat(roomId).catch(() => {})
    }

    const ch = supabase.channel(`room:${roomId}`, { config: { presence: { key: userId }, broadcast: { self: false } } })
    channel = ch

    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
      if (payload.eventType === 'DELETE') {
        store().set({ removed: true })
        return
      }
      const next = payload.new as Room
      const prev = store().room
      store().patchRoom(next)
      if (prev && prev.roster_version !== next.roster_version) {
        // Someone left or was removed (DELETE events can't be room-filtered, so this is the signal).
        const before = store().players
        void loadSnapshot(roomId).then(() => {
          const after = new Set(store().players.map((p) => p.id))
          const gone = before.filter((p) => !after.has(p.id) && p.user_id !== userId).map((p) => p.name)
          if (gone.length) toast(next.status === 'placing' ? `${gone.join(', ')} ออกจากห้อง การ์ดของเขาถูกเอาออกจากรอบนี้` : `${gone.join(', ')} ออกจากห้องแล้ว`)
        })
      } else if (!prev || prev.status !== next.status || prev.round !== next.round) {
        // A new phase or round changes my hand and the board in bulk: refetch to stay exact.
        refresh()
      }
    })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id
          if (!id) return
          const me = store().players.find((p) => p.user_id === userId)
          if (me && me.id === id) store().set({ removed: true })
          else store().removePlayer(id)
          return
        }
        const p = payload.new as Player
        if (p.room_id !== roomId) return
        if (p.user_id === userId && p.left_at) store().set({ removed: true })
        store().upsertPlayer(p)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_cards', filter: `room_id=eq.${roomId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { card_id?: string }).card_id
          if (id) store().removeCard(id)
          return
        }
        const c = payload.new as BoardCard
        if (c.room_id === roomId) store().upsertCard(c)
      })
      .on('presence', { event: 'sync' }, () => {
        store().set({ online: Object.keys(ch.presenceState()) })
      })
      .on('broadcast', { event: 'drag' }, ({ payload }) => {
        const { card_id, index } = payload as { card_id: string; index: number | null }
        store().setGhost(card_id, index)
      })
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          store().set({ connection: 'online' })
          void ch.track({ at: Date.now() })
          refresh()
          beat()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          store().set({ connection: 'reconnecting' })
        }
      })

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refresh()
        beat()
      }
    }
    const onOffline = () => store().set({ connection: 'reconnecting' })
    const onOnline = () => refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    const heartbeat = setInterval(beat, 10_000)
    // Drop stale ghosts (a drag whose "end" message was lost).
    const ghostSweep = setInterval(() => {
      const ghosts = store().ghosts
      const fresh = Object.fromEntries(Object.entries(ghosts).filter(([, g]) => g.index !== null && Date.now() - g.at < 2000))
      if (Object.keys(fresh).length !== Object.keys(ghosts).length) store().set({ ghosts: fresh })
    }, 1000)

    return () => {
      disposed = true
      clearInterval(heartbeat)
      clearInterval(ghostSweep)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      if (channel === ch) channel = null
      void supabase.removeChannel(ch)
    }
  }, [roomId, userId])
}
