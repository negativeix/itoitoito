// End-to-end game rules through the real RPCs (ITO_PLAN §1, §4.4, §8).
import { describe, expect, it } from 'vitest'
import { judge } from '../../src/lib/judge'
import {
  admin,
  call,
  expectCode,
  myHand,
  newUser,
  placeAll,
  players,
  playToRevealing,
  revealEverything,
  room,
  setupRoom,
} from './helpers'

describe('rooms & lobby', () => {
  it('creates a 4-letter code without I or O and joins by code', async () => {
    const { roomId, code, users } = await setupRoom(3)
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/)
    const ps = await players(roomId)
    expect(ps.map((p) => p.user_id)).toEqual(users.map((u) => u.uid))
    expect(new Set(ps.map((p) => p.color)).size).toBe(3)
    expect((await room(roomId)).host_user_id).toBe(users[0].uid)
  })

  it('rejoining is idempotent and keeps seat and colour', async () => {
    const { roomId, code, users } = await setupRoom(2)
    const before = await players(roomId)
    const res = await call<{ rejoined: boolean }>(users[1], 'join_room', { p_code: code, p_name: 'ชื่อใหม่' })
    expect(res.rejoined).toBe(true)
    expect(await players(roomId)).toEqual(before)
  })

  it('dedupes nicknames: บอส, บอส 2', async () => {
    const a = await newUser()
    const b = await newUser()
    const { code, room_id } = await call<{ code: string; room_id: string }>(a, 'create_room', { p_name: 'บอส' })
    await call(b, 'join_room', { p_code: code.toLowerCase(), p_name: '  บอส ' })
    expect((await players(room_id)).map((p) => p.name)).toEqual(['บอส', 'บอส 2'])
  })

  it('caps rooms at 10 players', async () => {
    const { code } = await setupRoom(10)
    await expectCode(call(await newUser(), 'join_room', { p_code: code, p_name: 'คนที่11' }), 'room_full')
  })

  it('unknown codes and empty names are rejected', async () => {
    const c = await newUser()
    await expectCode(call(c, 'join_room', { p_code: 'ZZZZ1', p_name: 'x' }), 'room_not_found')
    await expectCode(call(c, 'create_room', { p_name: '   ' }), 'invalid_name')
  })

  it('colour changes respect uniqueness', async () => {
    const { roomId, users } = await setupRoom(2)
    const [hostRow] = await players(roomId)
    await expectCode(call(users[1], 'set_color', { p_room: roomId, p_color: hostRow.color }), 'color_taken')
    await call(users[1], 'set_color', { p_room: roomId, p_color: '#4a4a4a' })
    expect((await players(roomId))[1].color).toBe('#4A4A4A')
  })

  it('settings: host only, lobby only, validated', async () => {
    const { roomId, users } = await setupRoom(2)
    await expectCode(call(users[1], 'update_settings', { p_room: roomId, p_mode: 'levelup', p_cards: 1, p_categories: ['general'] }), 'not_host')
    await expectCode(call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 4, p_categories: ['general'] }), 'invalid_settings')
    await expectCode(call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 1, p_categories: ['nope'] }), 'invalid_settings')
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 3, p_categories: ['friends', 'family'] })
    const r = await room(roomId)
    expect(r.cards_per_player).toBe(3)
    expect(r.theme_categories).toEqual(['family', 'friends'])
  })

  it('cannot start alone', async () => {
    const a = await newUser()
    const { room_id } = await call<{ room_id: string }>(a, 'create_room', { p_name: 'เดี่ยว' })
    await expectCode(call(a, 'start_round', { p_room: room_id }), 'need_two_players')
  })
})

describe('classic round', () => {
  it('deals unique numbers, judges a perfect row as a win', async () => {
    const { users, roomId } = await setupRoom(4)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 3, p_categories: ['general'] })
    await call(users[0], 'start_round', { p_room: roomId })
    const r1 = await room(roomId)
    expect(r1.status).toBe('choosing_theme')
    expect(r1.current_theme.category).toBe('general')

    await playToRevealing(users, roomId, 'asc')
    const { data: hands } = await admin.from('hands').select('value').eq('room_id', roomId)
    expect(hands).toHaveLength(12)
    expect(new Set(hands!.map((h) => h.value)).size).toBe(12)

    const done = await revealEverything(users[0], roomId)
    expect(done.status).toBe('result')
    expect(done.last_result).toMatchObject({ wrong: 0, total: 12, perfect: true })
  })

  it('wrong flags match the judge() rule for a reversed row', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 2, p_categories: ['general'] })
    await call(users[0], 'start_round', { p_room: roomId })
    await playToRevealing(users, roomId, 'desc')
    await revealEverything(users[0], roomId)

    const { data: board } = await admin.from('board_cards').select('*').eq('room_id', roomId).order('reveal_order')
    const values = board!.map((c) => c.revealed_value as number)
    expect(board!.map((c) => c.is_wrong)).toEqual(judge(values).wrong)
    expect((await room(roomId)).last_result.wrong).toBe(5)
  })

  it('lock requires every card placed; any move resets all locks', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    await call(users[0], 'confirm_theme', { p_room: roomId })
    await expectCode(call(users[1], 'lock_in', { p_room: roomId, p_locked: true }), 'cards_not_placed')

    const placed = await placeAll(users, roomId)
    await call(users[0], 'lock_in', { p_room: roomId, p_locked: true })
    await call(users[1], 'lock_in', { p_room: roomId, p_locked: true })
    expect((await players(roomId)).filter((p) => p.locked)).toHaveLength(2)

    const third = placed.find((p) => p.c === users[2])!
    await call(users[2], 'move_card', { p_card: third.card_id, p_position: 0.5 })
    expect((await players(roomId)).filter((p) => p.locked)).toHaveLength(0)
    expect((await room(roomId)).status).toBe('placing')

    for (const c of users) await call(c, 'lock_in', { p_room: roomId, p_locked: true })
    expect((await room(roomId)).status).toBe('revealing')
    await expectCode(call(users[2], 'move_card', { p_card: third.card_id, p_position: 9 }), 'wrong_phase')
  })

  it('reveal_next is idempotent under duplicate and concurrent calls', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    await playToRevealing(users, roomId)
    const results = await Promise.all([
      call<number>(users[0], 'reveal_next', { p_room: roomId, p_expected: -1 }),
      call<number>(users[0], 'reveal_next', { p_room: roomId, p_expected: -1 }),
      call<number>(users[0], 'reveal_next', { p_room: roomId, p_expected: -1 }),
    ])
    expect((await room(roomId)).reveal_index).toBe(0)
    expect(results.filter((r) => r === 0)).toHaveLength(3)
    // Stale expected index: no-op.
    await call(users[0], 'reveal_next', { p_room: roomId, p_expected: -1 })
    expect((await room(roomId)).reveal_index).toBe(0)
  })

  it('a non-host can continue the reveal (host dropped) but is paced', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    await playToRevealing(users, roomId)
    await admin.from('rooms').update({ last_reveal_at: new Date(Date.now() - 5000).toISOString() }).eq('id', roomId)
    expect(await call<number>(users[1], 'reveal_next', { p_room: roomId, p_expected: -1 })).toBe(0)
    // Immediately again: within 600 ms, so the pace guard holds it.
    expect(await call<number>(users[1], 'reveal_next', { p_room: roomId, p_expected: 0 })).toBe(0)
  })

  it('reveal_all finishes the round at once (host only)', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    await playToRevealing(users, roomId)
    await call(users[0], 'reveal_all', { p_room: roomId })
    const r = await room(roomId)
    expect(r.status).toBe('result')
    const { data } = await admin.from('board_cards').select('revealed_value').eq('room_id', roomId)
    expect(data!.every((c) => c.revealed_value !== null)).toBe(true)
  })

  it('clues are trimmed and capped at 24 characters', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'start_round', { p_room: roomId })
    await call(users[0], 'confirm_theme', { p_room: roomId })
    const [card] = await myHand(users[1], roomId)
    await call(users[1], 'set_clue', { p_card: card.card_id, p_clue: '  ข้าว   มันไก่  ' })
    const { data } = await users[0].from('board_cards').select('clue').eq('card_id', card.card_id).single()
    expect(data!.clue).toBe('ข้าว มันไก่')
    await expectCode(call(users[1], 'set_clue', { p_card: card.card_id, p_clue: 'ก'.repeat(25) }), 'clue_too_long')
  })

  it('next round clears old cards and picks a different theme', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'start_round', { p_room: roomId })
    const t1 = (await room(roomId)).current_theme.id
    await playToRevealing(users, roomId)
    await revealEverything(users[0], roomId)
    await call(users[0], 'next_round', { p_room: roomId })
    const r = await room(roomId)
    expect(r.status).toBe('choosing_theme')
    expect(r.round).toBe(2)
    expect(r.current_theme.id).not.toBe(t1)
    const { count } = await admin.from('hands').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
    expect(count).toBe(0)
  })

  it('back to lobby resets the game', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'start_round', { p_room: roomId })
    await playToRevealing(users, roomId)
    await call(users[0], 'back_to_lobby', { p_room: roomId })
    const r = await room(roomId)
    expect(r.status).toBe('lobby')
    expect(r.current_theme).toBeNull()
  })
})

describe('topic votes', () => {
  it('rerolls on a majority, at most twice per round; custom theme works', async () => {
    const { users, roomId } = await setupRoom(4)
    await call(users[0], 'start_round', { p_room: roomId })
    const t0 = (await room(roomId)).current_theme.id

    await call(users[1], 'vote_reroll', { p_room: roomId })
    await call(users[2], 'vote_reroll', { p_room: roomId })
    expect((await room(roomId)).current_theme.id).toBe(t0) // 2/4 is not more than half
    await call(users[2], 'vote_reroll', { p_room: roomId }) // toggle off
    await call(users[2], 'vote_reroll', { p_room: roomId })
    await call(users[3], 'vote_reroll', { p_room: roomId })
    const r1 = await room(roomId)
    expect(r1.current_theme.id).not.toBe(t0)
    expect(r1.theme_rerolls).toBe(1)
    expect((await players(roomId)).every((p) => !p.wants_reroll)).toBe(true)

    for (const c of users.slice(1)) await call(c, 'vote_reroll', { p_room: roomId })
    expect((await room(roomId)).theme_rerolls).toBe(2)
    await expectCode(call(users[1], 'vote_reroll', { p_room: roomId }), 'no_rerolls_left')

    await expectCode(call(users[1], 'set_custom_theme', { p_room: roomId, p_title: 'x', p_low: 'a', p_high: 'b' }), 'not_host')
    await expectCode(call(users[0], 'set_custom_theme', { p_room: roomId, p_title: 'x', p_low: '', p_high: 'b' }), 'invalid_theme')
    await call(users[0], 'set_custom_theme', { p_room: roomId, p_title: 'ความง่วงตอนบ่าย', p_low: 'ตาสว่าง', p_high: 'หลับคาโต๊ะ' })
    expect((await room(roomId)).current_theme).toMatchObject({ category: 'custom', title: 'ความง่วงตอนบ่าย' })
  })
})

describe('level up mode', () => {
  it('loses a heart per wrong card, gains one on a perfect level, ends at zero', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'levelup', p_cards: 1, p_categories: ['general'] })
    await call(users[0], 'start_round', { p_room: roomId })

    // Level 1, perfect: hearts stay capped at 3.
    await playToRevealing(users, roomId, 'asc')
    let r = await revealEverything(users[0], roomId)
    expect(r.last_result).toMatchObject({ wrong: 0, lives_before: 3, lives_after: 3, level: 1 })

    // Level 2: 2 cards each, reversed → 5 wrong → game over.
    await call(users[0], 'next_round', { p_room: roomId })
    expect((await room(roomId)).level).toBe(2)
    await playToRevealing(users, roomId, 'desc')
    expect(await myHand(users[1], roomId)).toHaveLength(2)
    r = await revealEverything(users[0], roomId)
    expect(r.status).toBe('game_over')
    expect(r.lives).toBe(0)
    expect(r.last_result).toMatchObject({ wrong: 5, level: 2, lives_after: 0 })

    // Play again from game over restarts at level 1 with 3 hearts.
    await call(users[0], 'start_round', { p_room: roomId })
    r = await room(roomId)
    expect([r.level, r.lives, r.round]).toEqual([1, 3, 1])
  })

  it('a perfect level after losing hearts gives one back', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'levelup', p_cards: 1, p_categories: ['general'] })
    await call(users[0], 'start_round', { p_room: roomId })
    await admin.from('rooms').update({ lives: 1 }).eq('id', roomId)
    await playToRevealing(users, roomId, 'asc')
    const r = await revealEverything(users[0], roomId)
    expect(r.last_result).toMatchObject({ lives_before: 1, lives_after: 2 })
  })

  it('ends with a deck-complete win when the next level needs more than 100 cards', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'levelup', p_cards: 1, p_categories: ['general'] })
    await call(users[0], 'start_round', { p_room: roomId })
    await playToRevealing(users, roomId)
    await revealEverything(users[0], roomId)
    await admin.from('rooms').update({ level: 50 }).eq('id', roomId) // 2 × 51 > 100
    await call(users[0], 'next_round', { p_room: roomId })
    const r = await room(roomId)
    expect(r.status).toBe('game_over')
    expect(r.last_result.deck_complete).toBe(true)
  })
})

describe('edge cases (§8)', () => {
  it('leaving during placing removes the cards and can trigger the reveal', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    await call(users[0], 'confirm_theme', { p_room: roomId })
    // Place first, then lock: any move resets everyone's lock.
    for (const c of users.slice(0, 2)) {
      const [h] = await myHand(c, roomId)
      await call(c, 'move_card', { p_card: h.card_id, p_position: Math.random() })
    }
    for (const c of users.slice(0, 2)) await call(c, 'lock_in', { p_room: roomId, p_locked: true })
    await call(users[2], 'leave_room', { p_room: roomId })
    const { count } = await admin.from('board_cards').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
    expect(count).toBe(2)
    expect((await room(roomId)).status).toBe('revealing')
  })

  it('leaving during reveal keeps the cards; the player is cleaned up next round', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    await playToRevealing(users, roomId)
    await call(users[2], 'leave_room', { p_room: roomId })
    const { count } = await admin.from('board_cards').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
    expect(count).toBe(3)
    await revealEverything(users[0], roomId)
    await call(users[0], 'next_round', { p_room: roomId })
    expect(await players(roomId)).toHaveLength(2)
  })

  it('joining mid-round spectates until the next round', async () => {
    const { users, roomId, code } = await setupRoom(2)
    await call(users[0], 'start_round', { p_room: roomId })
    await call(users[0], 'confirm_theme', { p_room: roomId })
    const late = await newUser()
    await call(late, 'join_room', { p_code: code, p_name: 'มาสาย' })
    expect((await players(roomId))[2].spectating).toBe(true)
    expect(await myHand(late, roomId)).toHaveLength(0)
    // Spectators can watch the face-down table.
    const { data } = await late.from('board_cards').select('*').eq('room_id', roomId)
    expect(data).toHaveLength(2)
    await expectCode(call(late, 'lock_in', { p_room: roomId, p_locked: true }), 'spectating')

    await placeAll(users, roomId)
    for (const c of users) await call(c, 'lock_in', { p_room: roomId, p_locked: true })
    expect((await room(roomId)).status).toBe('revealing') // the spectator does not block
    await revealEverything(users[0], roomId)
    await call(users[0], 'next_round', { p_room: roomId })
    expect((await players(roomId))[2].spectating).toBe(false)
  })

  it('host leaving hands over to the next seat; last one out deletes the room', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'leave_room', { p_room: roomId })
    expect((await room(roomId)).host_user_id).toBe(users[1].uid)
    await call(users[1], 'leave_room', { p_room: roomId })
    expect(await room(roomId)).toBeNull()
  })

  it('host migration requires the host to be silent for 20 seconds', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[1], 'heartbeat', { p_room: roomId })
    await call(users[2], 'heartbeat', { p_room: roomId })
    await expectCode(call(users[2], 'transfer_host', { p_room: roomId }), 'host_still_here')

    await admin.from('heartbeats').update({ seen_at: new Date(Date.now() - 30_000).toISOString() }).eq('user_id', users[0].uid)
    // Seat 2 calls, but the lowest online seat (1) becomes host.
    await call(users[2], 'transfer_host', { p_room: roomId })
    expect((await room(roomId)).host_user_id).toBe(users[1].uid)
  })

  it('host can hand over and kick directly', async () => {
    const { users, roomId } = await setupRoom(3)
    const ps = await players(roomId)
    await call(users[0], 'kick_player', { p_room: roomId, p_player: ps[2].id })
    expect(await players(roomId)).toHaveLength(2)
    await call(users[0], 'transfer_host', { p_room: roomId, p_to: ps[1].id })
    expect((await room(roomId)).host_user_id).toBe(users[1].uid)
  })

  it('my_room returns the room for auto-rejoin', async () => {
    const { users, roomId, code } = await setupRoom(2)
    expect(await call(users[1], 'my_room')).toEqual({ room_id: roomId, code })
  })

  it('stale rooms are cleaned up', async () => {
    const { roomId } = await setupRoom(2)
    await admin.from('rooms').update({ updated_at: new Date(Date.now() - 7 * 3600_000).toISOString() }).eq('id', roomId)
    const { data, error } = await admin.rpc('cleanup_stale_rooms')
    expect(error).toBeNull()
    expect(data).toBeGreaterThanOrEqual(1)
    expect(await room(roomId)).toBeNull()
  })
})
