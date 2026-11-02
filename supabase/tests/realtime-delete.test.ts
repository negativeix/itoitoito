// Kicks / leaves must reach other players' screens over realtime.
// Supabase Realtime does not deliver DELETE events to room-filtered subscriptions, so the server
// bumps rooms.roster_version (a filterable UPDATE) and clients refetch the snapshot.
import { expect, it } from 'vitest'
import { call, setTheme, setupRoom, sleep } from './helpers'

it('leaving bumps roster_version and the rooms UPDATE reaches the room', async () => {
  const { users, roomId } = await setupRoom(3)
  const [host, watcher, leaver] = users
  await call(host, 'start_round', { p_room: roomId })
  await setTheme(host, roomId)
  await call(host, 'confirm_theme', { p_room: roomId })

  const versions: number[] = []
  const ch = watcher
    .channel(`roster-${roomId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (p) =>
      versions.push((p.new as { roster_version: number }).roster_version),
    )
  await new Promise<void>((resolve) => ch.subscribe((s) => s === 'SUBSCRIBED' && resolve()))
  await sleep(500)

  await call(leaver, 'leave_room', { p_room: roomId })
  await sleep(1500)
  expect(versions).toContain(1)

  await call(host, 'kick_player', { p_room: roomId, p_player: (await watcher.from('players').select('id').eq('user_id', host.uid).single()).data!.id }).catch(
    (e: Error) => expect(e.message).toBe('cannot_kick_self'),
  )
  await watcher.removeChannel(ch)
})
