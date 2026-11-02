// Security tests for ITO_PLAN §4.3 — nobody may learn another player's number before reveal.
import { describe, expect, it } from 'vitest'
import { admin, call, dealAndPlace, expectCode, myHand, newUser, nextCard, room, setTheme, setupRoom, sleep, type Client } from './helpers'

describe('RLS: secret numbers', () => {
  it("user B never sees user A's hand rows", async () => {
    const { users, roomId } = await setupRoom(3)
    const [a, b] = users
    await call(a, 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 2 })
    await call(a, 'start_round', { p_room: roomId })
    await setTheme(a, roomId)
    await call(a, 'confirm_theme', { p_room: roomId })

    const bHand = await myHand(b, roomId)
    expect(bHand).toHaveLength(2)
    expect(bHand.every((h) => h.owner_user_id === b.uid)).toBe(true)

    const { data: targeted } = await b.from('hands').select('*').eq('owner_user_id', a.uid)
    expect(targeted).toEqual([])

    const { data: everything } = await b.from('hands').select('*')
    expect(everything!.every((h) => h.owner_user_id === b.uid)).toBe(true)

    // Sanity: the cards really exist (6 in total).
    const { count } = await admin.from('hands').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
    expect(count).toBe(6)
  })

  it('board_cards.revealed_value is null for everyone before reveal', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'start_round', { p_room: roomId })
    await setTheme(users[0], roomId)
    await call(users[0], 'confirm_theme', { p_room: roomId })
    const { data } = await users[1].from('board_cards').select('*').eq('room_id', roomId)
    expect(data).toHaveLength(2)
    expect(data!.every((c) => c.revealed_value === null && c.is_wrong === null)).toBe(true)
    expect(Object.keys(data![0])).not.toContain('value')
  })

  it('non-members see nothing of a room', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'start_round', { p_room: roomId })
    await setTheme(users[0], roomId)
    await call(users[0], 'confirm_theme', { p_room: roomId })
    const outsider = await newUser()
    for (const table of ['rooms', 'players', 'board_cards', 'hands']) {
      const { data } = await outsider.from(table).select('*')
      expect(data, table).toEqual([])
    }
  })

  it('clients cannot write tables directly', async () => {
    const { users, roomId } = await setupRoom(2)
    const [a, b] = users
    await call(a, 'start_round', { p_room: roomId })
    await setTheme(a, roomId)
    await call(a, 'confirm_theme', { p_room: roomId })
    const [card] = await myHand(b, roomId)

    const upd = await b.from('board_cards').update({ revealed_value: 1 }).eq('card_id', card.card_id).select()
    expect(upd.error ?? (upd.data?.length === 0 ? null : 'updated')).toBeTruthy()

    const ins = await b.from('hands').insert({ room_id: roomId, round: 1, owner_user_id: b.uid, value: 50 })
    expect(ins.error).toBeTruthy()

    const upRoom = await b.from('rooms').update({ host_user_id: b.uid }).eq('id', roomId).select()
    expect(upRoom.error ?? (upRoom.data?.length === 0 ? null : 'updated')).toBeTruthy()
    expect((await room(roomId)).host_user_id).toBe(a.uid)

    const hb = await b.from('heartbeats').select('*')
    expect(hb.error ?? hb.data).toBeTruthy()
    if (!hb.error) expect(hb.data).toEqual([])
  })

  it("players cannot move or label someone else's card, or call host actions", async () => {
    const { users, roomId } = await setupRoom(2)
    const [a, b] = users
    await call(a, 'start_round', { p_room: roomId })
    await setTheme(a, roomId)
    await call(a, 'confirm_theme', { p_room: roomId })
    const [aCard] = await myHand(a, roomId)
    await expectCode(call(b, 'move_card', { p_card: aCard.card_id, p_position: 1 }), 'not_your_card')
    await expectCode(call(b, 'set_clue', { p_card: aCard.card_id, p_clue: 'ฮา' }), 'not_your_card')
    await expectCode(call(b, 'reveal_all', { p_room: roomId }), 'not_host')
    await expectCode(call(b, 'back_to_lobby', { p_room: roomId }), 'not_host')
  })

  it('internal helpers are not callable by clients', async () => {
    const c = await newUser()
    const { error } = await c.rpc('_finish_round', { p_room: '00000000-0000-0000-0000-000000000000' })
    expect(error).toBeTruthy()
    const { error: e2 } = await c.rpc('cleanup_stale_rooms')
    expect(e2).toBeTruthy()
  })
})

describe('RLS: realtime payloads', () => {
  it('B receives board changes without values before reveal, and no hands events at all', async () => {
    const { users, roomId } = await setupRoom(2)
    const [a, b] = users as [Client, Client]
    await call(a, 'start_round', { p_room: roomId })

    const boardEvents: Record<string, unknown>[] = []
    const handEvents: unknown[] = []
    const channel = b
      .channel(`test-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_cards', filter: `room_id=eq.${roomId}` }, (p) =>
        boardEvents.push(p.new as Record<string, unknown>),
      )
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status))
      })
    })
    // `hands` is not in the realtime publication: subscribing must fail or stay silent.
    const handsChannel = b
      .channel(`test-hands-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hands' }, (p) => handEvents.push(p))
    handsChannel.subscribe()
    await sleep(800)

    await setTheme(a, roomId)

    await call(a, 'confirm_theme', { p_room: roomId })
    const [aCard] = await myHand(a, roomId)
    await call(a, 'move_card', { p_card: aCard.card_id, p_position: 1 })
    await call(a, 'set_clue', { p_card: aCard.card_id, p_clue: 'ส้มตำ' })
    await sleep(1500)

    expect(boardEvents.length).toBeGreaterThanOrEqual(3)
    for (const e of boardEvents) {
      expect(e.revealed_value ?? null).toBeNull()
      expect(e).not.toHaveProperty('value')
    }
    expect(handEvents).toHaveLength(0)
    await b.removeChannel(channel)
    await b.removeChannel(handsChannel)
  })

  it('values arrive over realtime only as cards are revealed', async () => {
    const { users, roomId } = await setupRoom(2)
    const [a, b] = users
    await call(a, 'start_round', { p_room: roomId })

    const seen: { card_id: string; revealed_value: number | null }[] = []
    const channel = b
      .channel(`test2-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'board_cards', filter: `room_id=eq.${roomId}` }, (p) =>
        seen.push(p.new as { card_id: string; revealed_value: number | null }),
      )
    await new Promise<void>((resolve) => channel.subscribe((s) => s === 'SUBSCRIBED' && resolve()))
    await sleep(500)

    await dealAndPlace(users, roomId)
    await sleep(800)
    expect(seen.every((e) => e.revealed_value === null)).toBe(true)

    const next = (await nextCard(users, roomId))!
    await call(next.owner, 'flip_card', { p_room: roomId, p_card: next.card_id })
    await sleep(1000)
    const revealed = seen.filter((e) => e.revealed_value !== null)
    expect(revealed).toHaveLength(1)
    await b.removeChannel(channel)
  })
})
