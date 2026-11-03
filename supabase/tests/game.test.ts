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

describe('free flipping (like the real game)', () => {
  it('deals unique numbers; flipping in value order wins', async () => {
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

  it('anyone can flip their own card at any time, straight from the hand; never someone else\'s', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    await setTheme(users[0], roomId)
    await call(users[0], 'confirm_theme', { p_room: roomId })
    // Nobody has placed anything yet.
    const [h1] = await myHand(users[1], roomId)
    await expectCode(call(users[2], 'flip_card', { p_room: roomId, p_card: h1.card_id }), 'not_your_card')
    await call(users[1], 'flip_card', { p_room: roomId, p_card: h1.card_id })
    const { data: c } = await admin.from('board_cards').select('*').eq('card_id', h1.card_id).single()
    expect(c!.revealed_value).toBe(h1.value)
    expect(c!.position).not.toBeNull()
    expect(c!.reveal_order).toBe(0)
    // Double tap: no-op.
    await call(users[1], 'flip_card', { p_room: roomId, p_card: h1.card_id })
    expect((await room(roomId)).reveal_index).toBe(0)
  })

  it('a flipped card joins the revealed row; face-down cards stay to its right', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'start_round', { p_room: roomId })
    const placed = await dealAndPlace(users, roomId, 'asc') // positions 1..3
    // The lowest card's owner hasn't moved it, but the highest card sits rightmost at position 3.
    // Flip the lowest: it becomes the first revealed card, left of every face-down card.
    await call(placed[0].c, 'flip_card', { p_room: roomId, p_card: placed[0].card_id })
    // Now flip the *rightmost* card (the highest): it moves to sit right after the revealed row.
    await call(placed[2].c, 'flip_card', { p_room: roomId, p_card: placed[2].card_id })
    const { data: board } = await admin.from('board_cards').select('*').eq('room_id', roomId).order('position')
    expect(board!.map((x) => x.card_id)).toEqual([placed[0].card_id, placed[2].card_id, placed[1].card_id])
    await expectCode(call(placed[1].c, 'move_card', { p_card: placed[1].card_id, p_position: 0.5 }), 'invalid_position')
    await expectCode(call(placed[2].c, 'move_card', { p_card: placed[2].card_id, p_position: 99 }), 'card_revealed')
  })

  it('classic: a snapped thread does not end the round; play on until every card is flipped', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'classic', p_cards: 2 })
    await call(users[0], 'start_round', { p_room: roomId })
    await dealAndPlace(users, roomId, 'desc')
    // First flip (the highest) is fine, the second snaps the thread — and the round goes on.
    const first = await nextCard(users, roomId)
    await call(first!.owner, 'flip_card', { p_room: roomId, p_card: first!.card_id })
    const second = await nextCard(users, roomId)
    await call(second!.owner, 'flip_card', { p_room: roomId, p_card: second!.card_id })
    expect((await room(roomId)).status).toBe('placing')
    const done = await flipAll(users, roomId)
    expect(done.status).toBe('result')
    expect(done.reveal_index).toBe(5) // 0-based: all 6 flipped
    // Descending order: every card after the first is lower than the highest so far.
    expect(done.last_result).toMatchObject({ wrong: 5, total: 6, perfect: false })
    const { data: board } = await admin.from('board_cards').select('*').eq('room_id', roomId).order('reveal_order')
    expect(board!.every((x) => x.revealed_value !== null && x.is_wrong !== null)).toBe(true)
    expect(board!.map((x) => x.is_wrong)).toEqual(judge(board!.map((x) => x.revealed_value)).wrong)
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
    await call(users[1], 'set_clue', { p_card: card.card_id, p_clue: 'ก'.repeat(60) })
    await expectCode(call(users[1], 'set_clue', { p_card: card.card_id, p_clue: 'ก'.repeat(61) }), 'clue_too_long')
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
  it('loses a heart per wrong card; at 0 hearts the round is played out, then game over', async () => {
    const { users, roomId } = await setupRoom(3)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'levelup', p_cards: 1 })
    await call(users[0], 'start_round', { p_room: roomId })

    // Level 1 perfect: hearts stay capped at 3.
    await dealAndPlace(users, roomId, 'asc')
    let r = await flipAll(users, roomId)
    expect(r.last_result).toMatchObject({ wrong: 0, lives_before: 3, lives_after: 3, level: 1 })

    // Level 2: 6 cards placed descending → hearts run out at the 3rd wrong card, play goes on.
    await call(users[0], 'next_round', { p_room: roomId })
    expect((await room(roomId)).level).toBe(2)
    await dealAndPlace(users, roomId, 'desc')
    for (let i = 0; i < 4; i++) {
      const next = await nextCard(users, roomId)
      await call(next!.owner, 'flip_card', { p_room: roomId, p_card: next!.card_id })
    }
    expect((await room(roomId)).status).toBe('placing') // 3 wrong, 0 hearts, still playing
    r = await flipAll(users, roomId)
    expect(r.status).toBe('game_over')
    expect(r.reveal_index).toBe(5)
    expect(r.last_result).toMatchObject({ wrong: 5, total: 6, lives_after: 0, level: 2 })
    const { data: board } = await admin.from('board_cards').select('*').eq('room_id', roomId)
    expect(board!.every((c) => c.revealed_value !== null && c.is_wrong !== null)).toBe(true)

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

  it('played for real: lose a heart, then a perfect level gives it back (never above 3)', async () => {
    const { users, roomId } = await setupRoom(2)
    await call(users[0], 'update_settings', { p_room: roomId, p_mode: 'levelup', p_cards: 1 })
    await call(users[0], 'start_round', { p_room: roomId })

    // Level 1 placed descending: one wrong card → 3 - 1 = 2 hearts.
    await dealAndPlace(users, roomId, 'desc')
    let r = await flipAll(users, roomId)
    expect(r.last_result).toMatchObject({ wrong: 1, lives_before: 3, lives_after: 2 })
    expect(r.lives).toBe(2)

    // Level 2 perfect: +1 → 3.
    await call(users[0], 'next_round', { p_room: roomId })
    expect((await room(roomId)).lives).toBe(2) // carried into the next level
    await dealAndPlace(users, roomId, 'asc')
    r = await flipAll(users, roomId)
    expect(r.last_result).toMatchObject({ wrong: 0, lives_before: 2, lives_after: 3, level: 2 })
    expect(r.lives).toBe(3)

    // Level 3 perfect again: already full, stays at 3.
    await call(users[0], 'next_round', { p_room: roomId })
    await dealAndPlace(users, roomId, 'asc')
    r = await flipAll(users, roomId)
    expect(r.last_result).toMatchObject({ wrong: 0, lives_before: 3, lives_after: 3, level: 3 })
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
      await call(next.owner, 'flip_card', { p_room: roomId, p_card: next.card_id })
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
