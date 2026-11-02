// End-to-end game rules through the real RPCs (ITO_PLAN §1, §4.4, §8).
import { describe, expect, it } from 'vitest'
import { judge } from '../../src/lib/judge'
import {
  admin,
  call,
  dealAndPlace,
  expectCode,
  flipAll,
  myHand,
  newUser,
  nextCard,
  placeAll,
  players,
  room,
  setTheme,
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
    await expectCode(call(users[1], 'update_settings', { p_room: roomId, p_mode: 'levelup', p_cards: 1 }), 'not_host')
    await expectCode(call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 4 }), 'invalid_settings')
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 3 })
    expect((await room(roomId)).cards_per_player).toBe(3)
  })

  it('cannot start alone', async () => {
    const a = await newUser()
    const { room_id } = await call<{ room_id: string }>(a, 'create_room', { p_name: 'เดี่ยว' })
    await expectCode(call(a, 'start_round', { p_room: room_id }), 'need_two_players')
  })
})

describe('topic (custom first)', () => {
  it('any player can set the topic; host cannot deal without one', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    expect((await room(roomId)).current_theme).toBeNull()
    await expectCode(call(users[0], 'confirm_theme', { p_room: roomId }), 'no_theme')

    await expectCode(call(users[2], 'set_theme', { p_room: roomId, p_title: 'x', p_low: '', p_high: 'b' }), 'invalid_theme')
    await call(users[2], 'set_theme', { p_room: roomId, p_title: '  ความเมาของเพื่อนแต่ละคน ', p_low: 'สร่าง', p_high: 'คลานกลับบ้าน' })
    expect((await room(roomId)).current_theme).toMatchObject({ category: 'custom', title: 'ความเมาของเพื่อนแต่ละคน', set_by: 'ผู้เล่น2' })

    await call(users[1], 'set_theme', { p_room: roomId, p_title: 'ความหวานของขนม', p_low: 'จืด', p_high: 'หวานเจี๊ยบ', p_source_id: 'general-15' })
    expect((await room(roomId)).current_theme).toMatchObject({ id: 'general-15', category: 'suggested', set_by: 'ผู้เล่น1' })
    await expectCode(call(users[1], 'confirm_theme', { p_room: roomId }), 'not_host')
  })

  it('remembers played topics per room, newest first, without duplicates', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'start_round', { p_room: roomId })
    for (const title of ['หัวข้อ A', 'หัวข้อ B', 'หัวข้อ A']) {
      await setTheme(users[0], roomId, title)
      await call(users[0], 'confirm_theme', { p_room: roomId })
      await call(users[0], 'reveal_all', { p_room: roomId }).catch(() => {}) // cards not placed: fine
      await call(users[0], 'back_to_lobby', { p_room: roomId })
      await call(users[0], 'start_round', { p_room: roomId })
    }
    const history = (await room(roomId)).theme_history as { title: string; set_by?: string }[]
    expect(history.map((h) => h.title)).toEqual(['หัวข้อ A', 'หัวข้อ B'])
    expect(history[0]).not.toHaveProperty('set_by')
  })
})

describe('flip one card at a time', () => {
  it('deals unique numbers; owners flip in table order; a perfect row wins', async () => {
    const { users, roomId } = await setupRoom(4)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 3 })
    await call(users[0], 'start_round', { p_room: roomId })
    await dealAndPlace(users, roomId, 'asc')
    const { data: hands } = await admin.from('hands').select('value').eq('room_id', roomId)
    expect(hands).toHaveLength(12)
    expect(new Set(hands!.map((h) => h.value)).size).toBe(12)

    const done = await flipAll(users, roomId)
    expect(done.status).toBe('result')
    expect(done.last_result).toMatchObject({ wrong: 0, total: 12, perfect: true })
  })

  it('only the next card can be flipped, only by its owner (or the host), only when all cards are placed', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    await setTheme(users[0], roomId)
    await call(users[0], 'confirm_theme', { p_room: roomId })
    const [h1] = await myHand(users[1], roomId)
    await call(users[1], 'move_card', { p_card: h1.card_id, p_position: 1 })
    await expectCode(call(users[1], 'flip_next', { p_room: roomId, p_card: h1.card_id }), 'cards_not_placed')

    await placeAll(users, roomId, 'asc')
    const next = (await nextCard(users, roomId))!
    const stranger = users.find((u) => u !== next.owner && u !== users[0])
    if (stranger) await expectCode(call(stranger, 'flip_next', { p_room: roomId, p_card: next.card_id }), 'not_your_turn')

    // Not the leftmost card → refused.
    const { data: board } = await admin.from('board_cards').select('card_id').eq('room_id', roomId).order('position', { ascending: false }).limit(1)
    await expectCode(call(users[0], 'flip_next', { p_room: roomId, p_card: board![0].card_id }), 'order_changed')

    // The host may flip for someone else.
    await call(users[0], 'flip_next', { p_room: roomId, p_card: next.card_id })
    expect((await room(roomId)).reveal_index).toBe(0)
    // Double tap: no-op.
    await call(users[0], 'flip_next', { p_room: roomId, p_card: next.card_id })
    expect((await room(roomId)).reveal_index).toBe(0)
  })

  it('players rearrange face-down cards between flips, but only right of revealed cards', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 2 })
    await call(users[0], 'start_round', { p_room: roomId })
    const placed = await dealAndPlace(users, roomId, 'desc') // positions 1..6, highest value first

    // Flip the first (highest) card.
    const first = (await nextCard(users, roomId))!
    await call(first.owner, 'flip_next', { p_room: roomId, p_card: first.card_id })
    const { data: flipped } = await admin.from('board_cards').select('*').eq('card_id', first.card_id).single()
    expect(flipped!.revealed_value).toBe(placed[0].value)
    expect(flipped!.is_wrong).toBe(false)

    // Revealed cards are fixed; face-down ones can't go left of them.
    await expectCode(call(first.owner, 'move_card', { p_card: first.card_id, p_position: 99 }), 'card_revealed')
    const lowest = placed[placed.length - 1]
    await expectCode(call(lowest.c, 'move_card', { p_card: lowest.card_id, p_position: 0.5 }), 'invalid_position')

    // With the new information everyone re-sorts the rest ascending (right of position 1).
    const rest = placed.slice(1).sort((a, b) => a.value - b.value)
    for (let i = 0; i < rest.length; i++) await call(rest[i].c, 'move_card', { p_card: rest[i].card_id, p_position: 2 + i })

    const done = await flipAll(users, roomId)
    // Only the cards lower than the first revealed card count as wrong: all 5 here.
    const { data: board } = await admin.from('board_cards').select('*').eq('room_id', roomId).order('reveal_order')
    expect(board!.map((c) => c.is_wrong)).toEqual(judge(board!.map((c) => c.revealed_value)).wrong)
    expect(done.last_result.wrong).toBe(5)
  })

  it('a stale "next card" is refused with order_changed after someone moves in front', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 2 })
    await call(users[0], 'start_round', { p_room: roomId })
    await dealAndPlace(users, roomId)
    const seen = (await nextCard(users, roomId))!
    const other = users.find((u) => u !== seen.owner)!
    const [otherCard] = await myHand(other, roomId)
    await call(other, 'move_card', { p_card: otherCard.card_id, p_position: -5 })
    if (otherCard.card_id !== seen.card_id) {
      await expectCode(call(seen.owner, 'flip_next', { p_room: roomId, p_card: seen.card_id }), 'order_changed')
    }
  })

  it('wrong flags match judge() for a reversed row', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 2 })
    await call(users[0], 'start_round', { p_room: roomId })
    await dealAndPlace(users, roomId, 'desc')
    await flipAll(users, roomId)
    const { data: board } = await admin.from('board_cards').select('*').eq('room_id', roomId).order('reveal_order')
    const values = board!.map((c) => c.revealed_value as number)
    expect(board!.map((c) => c.is_wrong)).toEqual(judge(values).wrong)
    expect((await room(roomId)).last_result.wrong).toBe(5)
  })

  it('reveal_all finishes the round at once (host only)', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    await dealAndPlace(users, roomId)
    await expectCode(call(users[1], 'reveal_all', { p_room: roomId }), 'not_host')
    await call(users[0], 'reveal_all', { p_room: roomId })
    expect((await room(roomId)).status).toBe('result')
  })

  it('clues are trimmed and capped at 24 characters', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'start_round', { p_room: roomId })
    await setTheme(users[0], roomId)
    await call(users[0], 'confirm_theme', { p_room: roomId })
    const [card] = await myHand(users[1], roomId)
    await call(users[1], 'set_clue', { p_card: card.card_id, p_clue: '  ข้าว   มันไก่  ' })
    const { data } = await users[0].from('board_cards').select('clue').eq('card_id', card.card_id).single()
    expect(data!.clue).toBe('ข้าว มันไก่')
    await expectCode(call(users[1], 'set_clue', { p_card: card.card_id, p_clue: 'ก'.repeat(25) }), 'clue_too_long')
  })

  it('next round clears old cards and asks for a new topic', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'start_round', { p_room: roomId })
    await dealAndPlace(users, roomId)
    await flipAll(users, roomId)
    await call(users[0], 'next_round', { p_room: roomId })
    const r = await room(roomId)
    expect([r.status, r.round, r.current_theme, r.reveal_index]).toEqual(['choosing_theme', 2, null, -1])
    const { count } = await admin.from('hands').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
    expect(count).toBe(0)
  })
})

describe('level up mode', () => {
  it('loses a heart per wrong card and ends the moment hearts run out', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'levelup', p_cards: 1 })
    await call(users[0], 'start_round', { p_room: roomId })

    // Level 1 perfect: hearts stay capped at 3.
    await dealAndPlace(users, roomId, 'asc')
    let r = await flipAll(users, roomId)
    expect(r.last_result).toMatchObject({ wrong: 0, lives_before: 3, lives_after: 3, level: 1 })

    // Level 2: 6 cards placed descending → the 3rd wrong card (4th flip) ends the game early.
    await call(users[0], 'next_round', { p_room: roomId })
    expect((await room(roomId)).level).toBe(2)
    await dealAndPlace(users, roomId, 'desc')
    r = await flipAll(users, roomId)
    expect(r.status).toBe('game_over')
    expect(r.reveal_index).toBe(3)
    expect(r.last_result).toMatchObject({ wrong: 3, total: 6, lives_after: 0, level: 2 })
    // The cards nobody flipped are shown in the result but not judged.
    const { data: board } = await admin.from('board_cards').select('*').eq('room_id', roomId)
    expect(board!.every((c) => c.revealed_value !== null)).toBe(true)
    expect(board!.filter((c) => c.is_wrong === null)).toHaveLength(2)

    await call(users[0], 'start_round', { p_room: roomId })
    r = await room(roomId)
    expect([r.level, r.lives, r.round]).toEqual([1, 3, 1])
  })

  it('a perfect level after losing hearts gives one back', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'levelup', p_cards: 1 })
    await call(users[0], 'start_round', { p_room: roomId })
    await admin.from('rooms').update({ lives: 1 }).eq('id', roomId)
    await dealAndPlace(users, roomId, 'asc')
    const r = await flipAll(users, roomId)
    expect(r.last_result).toMatchObject({ lives_before: 1, lives_after: 2 })
  })

  it('ends with a deck-complete win when the next level needs more than 100 cards', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'levelup', p_cards: 1 })
    await call(users[0], 'start_round', { p_room: roomId })
    await dealAndPlace(users, roomId)
    await flipAll(users, roomId)
    await admin.from('rooms').update({ level: 50 }).eq('id', roomId) // 2 × 51 > 100
    await call(users[0], 'next_round', { p_room: roomId })
    const r = await room(roomId)
    expect(r.status).toBe('game_over')
    expect(r.last_result.deck_complete).toBe(true)
  })
})

describe('edge cases (§8)', () => {
  it('leaving before any flip removes the player and their cards', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    await dealAndPlace(users, roomId)
    await call(users[2], 'leave_room', { p_room: roomId })
    const { count } = await admin.from('board_cards').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
    expect(count).toBe(2)
    expect(await players(roomId)).toHaveLength(2)
    expect((await room(roomId)).roster_version).toBe(1)
  })

  it('leaving after flips keeps revealed cards, drops face-down ones, and can end the round', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 2 })
    await call(users[0], 'start_round', { p_room: roomId })
    const placed = await dealAndPlace(users, roomId)
    // Flip everything except the leaver's last face-down card(s).
    const leaver = placed[placed.length - 1].c
    for (;;) {
      const next = (await nextCard(users, roomId))!
      if (next.owner === leaver && placed.filter((p) => p.c === leaver).length > 0) {
        const left = await admin.from('board_cards').select('card_id').eq('room_id', roomId).is('revealed_value', null)
        if (left.data!.every((c) => placed.find((p) => p.card_id === c.card_id)!.c === leaver)) break
      }
      await call(next.owner, 'flip_next', { p_room: roomId, p_card: next.card_id })
    }
    await call(leaver, 'leave_room', { p_room: roomId })
    const r = await room(roomId)
    expect(r.status).toBe('result')
    // Marked as left if they had revealed cards (those stay on the table), otherwise removed.
    const row = (await players(roomId)).find((p) => p.user_id === leaver.uid)
    expect(row === undefined || row.left_at !== null).toBe(true)
  })

  it('joining mid-round spectates until the next round', async () => {
    const { users, roomId, code } = await setupRoom(2)
    await call(users[0], 'start_round', { p_room: roomId })
    await dealAndPlace(users, roomId)
    const late = await newUser()
    await call(late, 'join_room', { p_code: code, p_name: 'มาสาย' })
    expect((await players(roomId))[2].spectating).toBe(true)
    expect(await myHand(late, roomId)).toHaveLength(0)
    const { data } = await late.from('board_cards').select('*').eq('room_id', roomId)
    expect(data).toHaveLength(2)
    await flipAll(users, roomId)
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
