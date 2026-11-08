import { describe, expect, it } from 'vitest'
import { admin, call, expectCode, newUser, players, room, setupRoom, type Client } from './helpers'

// ใครไม่รู้: server rules, secrecy and scoring.

async function state(roomId: string) {
  const { data } = await admin.from('iknow_state').select('*').eq('room_id', roomId).single()
  return data
}
async function secret(roomId: string) {
  const { data } = await admin.from('iknow_secret').select('*').eq('room_id', roomId).single()
  return data
}
async function hand(c: Client, roomId: string): Promise<number[]> {
  const { data } = await c.from('iknow_hands').select('card').eq('room_id', roomId).order('card')
  return (data ?? []).map((r) => r.card as number)
}
async function deckSize(roomId: string) {
  const { count } = await admin.from('iknow_deck').select('*', { count: 'exact', head: true }).eq('room_id', roomId)
  return count ?? 0
}

/** Starts a game and returns who is who. */
async function startGame(n: number) {
  const { users, roomId } = await setupRoom(n)
  await call(users[0], 'set_game', { p_room: roomId, p_game: 'iknow' })
  await call(users[0], 'iknow_start', { p_room: roomId })
  const ps = await players(roomId)
  const byPlayer = (id: string) => users.find((u) => u.uid === ps.find((p) => p.id === id)!.user_id)!
  const s = await state(roomId)
  const keeper = byPlayer(s.keeper_id)
  return { users, roomId, ps, byPlayer, keeper }
}

/** Keeper picks the first offered rule and the first deck card; returns the turn player. */
async function setUp(g: Awaited<ReturnType<typeof startGame>>) {
  const sec = await call<{ rule_options: number[] }>(g.keeper, 'iknow_secret', { p_room: g.roomId })
  await call(g.keeper, 'iknow_pick_rule', { p_room: g.roomId, p_rule: sec.rule_options[0] })
  const s2 = await call<{ deck: number[] }>(g.keeper, 'iknow_secret', { p_room: g.roomId })
  await call(g.keeper, 'iknow_pick_start', { p_room: g.roomId, p_card: s2.deck[0] })
  return g.byPlayer((await state(g.roomId)).turn_id)
}

describe('ใครไม่รู้: setup', () => {
  it('needs 3 players, deals 7 to everyone but the keeper, keeps the rule secret', async () => {
    const two = await setupRoom(2)
    await call(two.users[0], 'set_game', { p_room: two.roomId, p_game: 'iknow' })
    await expectCode(call(two.users[0], 'iknow_start', { p_room: two.roomId }), 'need_three_players')

    const g = await startGame(4)
    const s = await state(g.roomId)
    expect(s.phase).toBe('pick_rule')
    expect((await room(g.roomId)).status).toBe('placing')
    for (const u of g.users) expect(await hand(u, g.roomId)).toHaveLength(u === g.keeper ? 0 : 7)
    expect(await deckSize(g.roomId)).toBe(72 - 3 * 7)
    expect(Object.values(s.hand_counts)).toEqual([7, 7, 7])

    // Only the keeper learns anything secret.
    const other = g.users.find((u) => u !== g.keeper)!
    expect(await call(other, 'iknow_secret', { p_room: g.roomId })).toEqual({})
    const mine = await call<{ rule_options: number[] }>(g.keeper, 'iknow_secret', { p_room: g.roomId })
    expect(mine.rule_options).toHaveLength(3)
    await expectCode(call(other, 'iknow_pick_rule', { p_room: g.roomId, p_rule: mine.rule_options[0] }), 'not_keeper')
    const bad = [...Array(60).keys()].map((i) => i + 1).find((x) => !mine.rule_options.includes(x))
    await expectCode(call(g.keeper, 'iknow_pick_rule', { p_room: g.roomId, p_rule: bad }), 'invalid_rule')
  })

  it('RLS: no one reads another hand, the deck or the secret table', async () => {
    const g = await startGame(3)
    const [a, b] = g.users.filter((u) => u !== g.keeper)
    const aCards = await hand(a, g.roomId)
    const { data: seen } = await b.from('iknow_hands').select('card').eq('room_id', g.roomId).in('card', aCards)
    expect(seen ?? []).toHaveLength(0)
    for (const t of ['iknow_deck', 'iknow_secret']) {
      const { data, error } = await g.keeper.from(t).select('*').eq('room_id', g.roomId)
      expect(error ?? (data ?? []).length === 0).toBeTruthy()
    }
    const outsider = await newUser()
    const { data: st } = await outsider.from('iknow_state').select('*').eq('room_id', g.roomId)
    expect(st ?? []).toHaveLength(0)
    expect(JSON.stringify(await state(g.roomId))).not.toContain('rule_id')
  })

  it('the keeper picks the first card from the deck; then a random non-keeper starts', async () => {
    const g = await startGame(3)
    const sec = await call<{ rule_options: number[] }>(g.keeper, 'iknow_secret', { p_room: g.roomId })
    await call(g.keeper, 'iknow_pick_rule', { p_room: g.roomId, p_rule: sec.rule_options[1] })
    expect((await secret(g.roomId)).rule_id).toBe(sec.rule_options[1])
    const { deck } = await call<{ deck: number[] }>(g.keeper, 'iknow_secret', { p_room: g.roomId })
    expect(deck).toHaveLength(72 - 14)
    const inHand = (await hand(g.users.find((u) => u !== g.keeper)!, g.roomId))[0]
    await expectCode(call(g.keeper, 'iknow_pick_start', { p_room: g.roomId, p_card: inHand }), 'card_not_found')
    await call(g.keeper, 'iknow_pick_start', { p_room: g.roomId, p_card: deck[5] })
    const s = await state(g.roomId)
    expect(s.table_cards).toEqual([deck[5]])
    expect(s.phase).toBe('turn')
    expect(s.turn_id).not.toBe(s.keeper_id)
  })
})

describe('ใครไม่รู้: turns', () => {
  it('stage → submit → approve puts the set on the table and passes the turn', async () => {
    const g = await startGame(3)
    const p = await setUp(g)
    const cards = (await hand(p, g.roomId)).slice(0, 2)
    const other = g.users.find((u) => u !== p && u !== g.keeper)!
    await expectCode(call(other, 'iknow_stage', { p_room: g.roomId, p_cards: cards }), 'not_your_turn')
    await expectCode(call(p, 'iknow_stage', { p_room: g.roomId, p_cards: [(await hand(other, g.roomId))[0]] }), 'card_not_found')
    await call(p, 'iknow_stage', { p_room: g.roomId, p_cards: [cards[1], cards[0]] })
    expect((await state(g.roomId)).staging).toEqual([cards[1], cards[0]]) // public, in order
    await call(p, 'iknow_submit', { p_room: g.roomId })
    expect((await state(g.roomId)).phase).toBe('judging')
    await expectCode(call(p, 'iknow_stage', { p_room: g.roomId, p_cards: cards }), 'wrong_phase') // locked
    await expectCode(call(p, 'iknow_judge', { p_room: g.roomId, p_ok: true }), 'not_keeper')
    await call(g.keeper, 'iknow_judge', { p_room: g.roomId, p_ok: true })
    const s = await state(g.roomId)
    expect(s.table_cards.slice(1)).toEqual([cards[1], cards[0]])
    expect(await hand(p, g.roomId)).toHaveLength(5)
    expect(s.turn_id).toBe(g.ps.find((x) => x.user_id === other.uid)!.id)
    expect(s.staging).toEqual([])
  })

  it('a rejected set goes back to the hand and is logged for everyone', async () => {
    const g = await startGame(3)
    const p = await setUp(g)
    const [c] = await hand(p, g.roomId)
    await call(p, 'iknow_stage', { p_room: g.roomId, p_cards: [c] })
    await call(p, 'iknow_submit', { p_room: g.roomId })
    await call(g.keeper, 'iknow_judge', { p_room: g.roomId, p_ok: false })
    const s = await state(g.roomId)
    expect(await hand(p, g.roomId)).toHaveLength(7)
    expect(s.table_cards).toHaveLength(1)
    expect(s.rejected).toEqual([{ p: g.ps.find((x) => x.user_id === p.uid)!.id, cards: [c], t: 1 }])
  })

  it("can't play, keeper finds one: it goes on the table and they draw 1 from the deck", async () => {
    const g = await startGame(3)
    const p = await setUp(g)
    await call(p, 'iknow_cant_play', { p_room: g.roomId })
    const { check_hand } = await call<{ check_hand: number[] }>(g.keeper, 'iknow_secret', { p_room: g.roomId })
    expect(check_hand).toEqual(await hand(p, g.roomId)) // keeper sees exactly that hand
    const deckBefore = await deckSize(g.roomId)
    await call(g.keeper, 'iknow_check', { p_room: g.roomId, p_card: check_hand[3] })
    const after = await hand(p, g.roomId)
    expect(after).toHaveLength(7)
    expect(after).not.toContain(check_hand[3])
    expect(await deckSize(g.roomId)).toBe(deckBefore - 1)
    expect((await state(g.roomId)).table_cards.at(-1)).toBe(check_hand[3])
  })

  it("can't play for real: the hand goes back into the deck and they draw one fewer", async () => {
    const g = await startGame(3)
    const p = await setUp(g)
    const before = await hand(p, g.roomId)
    await call(p, 'iknow_cant_play', { p_room: g.roomId })
    const deckBefore = await deckSize(g.roomId)
    await call(g.keeper, 'iknow_check', { p_room: g.roomId, p_card: null })
    expect(await hand(p, g.roomId)).toHaveLength(6)
    expect(await deckSize(g.roomId)).toBe(deckBefore + 1)
    expect((await state(g.roomId)).last_check).toMatchObject({ card: null, n: 7 })
    expect(before).toHaveLength(7)
  })
})

describe('ใครไม่รู้: guessing and scoring', () => {
  it('empty hand → guess 1 of 3; wrong passes on with fresh decoys; right scores +2 / -2 / -1', async () => {
    const g = await startGame(4)
    const p = await setUp(g)
    const pid = g.ps.find((x) => x.user_id === p.uid)!.id
    // Play the whole hand in one approved set.
    await call(p, 'iknow_stage', { p_room: g.roomId, p_cards: await hand(p, g.roomId) })
    await call(p, 'iknow_submit', { p_room: g.roomId })
    await call(g.keeper, 'iknow_judge', { p_room: g.roomId, p_ok: true })
    let s = await state(g.roomId)
    expect(s.phase).toBe('guessing')
    expect(s.guesser_id).toBe(pid)

    const rule = (await secret(g.roomId)).rule_id
    const { guess_options } = await call<{ guess_options: number[] }>(p, 'iknow_secret', { p_room: g.roomId })
    expect(guess_options).toHaveLength(3)
    expect(guess_options).toContain(rule)
    const others = g.users.filter((u) => u !== p && u !== g.keeper)
    expect(await call(others[0], 'iknow_secret', { p_room: g.roomId })).toEqual({})

    // Wrong pick: only that rule is made public; the chance moves to the next player.
    const wrong = guess_options.find((x) => x !== rule)!
    await call(p, 'iknow_guess', { p_room: g.roomId, p_rule: wrong })
    s = await state(g.roomId)
    expect(s.phase).toBe('guess_wrong')
    expect(s.wrong_guesses).toEqual([{ p: pid, rule: wrong }])
    expect(JSON.stringify(s)).not.toContain(`"rule":${rule}`)
    // Only the next player in seat order (or the host) takes the chance.
    const order = g.ps.filter((x) => x.id !== s.keeper_id).sort((x, y) => x.seat - y.seat)
    const after = order.find((x) => x.seat > order.find((y) => y.id === pid)!.seat) ?? order[0]
    const nextUser = g.byPlayer(after.id)
    const notNext = g.users.find((u) => u !== nextUser && u !== g.users[0])
    if (notNext) await expectCode(call(notNext, 'iknow_pass_guess', { p_room: g.roomId }), 'not_your_turn')
    await call(nextUser, 'iknow_pass_guess', { p_room: g.roomId })
    s = await state(g.roomId)
    expect(s.phase).toBe('guessing')
    const next = g.byPlayer(s.guesser_id)
    expect(next).toBe(nextUser)
    expect(next).not.toBe(p)
    expect(next).not.toBe(g.keeper)
    const opts2 = (await call<{ guess_options: number[] }>(next, 'iknow_secret', { p_room: g.roomId })).guess_options
    expect(opts2).toContain(rule)
    expect(opts2).not.toContain(wrong)

    // Make hand sizes distinct for the scoring check: the non-guesser other drops to 6.
    const lastOther = others.find((u) => u !== next)!
    await admin.from('iknow_hands').delete().eq('room_id', g.roomId).eq('owner_user_id', lastOther.uid).eq('card', (await hand(lastOther, g.roomId))[0])

    await call(next, 'iknow_guess', { p_room: g.roomId, p_rule: rule })
    s = await state(g.roomId)
    expect(s.phase).toBe('done')
    expect((await room(g.roomId)).status).toBe('result')
    const id = (u: Client) => g.ps.find((x) => x.user_id === u.uid)!.id
    expect(s.result.rule).toBe(rule)
    expect(s.result.options).toHaveLength(3)
    expect(s.result.deltas).toEqual({ [id(next)]: 2, [id(p)]: 0, [id(lastOther)]: -2 })
    expect(s.scores[id(g.keeper)]).toBe(0) // the keeper never scores in their round
    expect(s.scores[id(next)]).toBe(2)
  })

  it('ties share the penalty; the keeper rotates and the game ends once everyone has kept', async () => {
    const g = await startGame(3)
    const p = await setUp(g)
    await call(p, 'iknow_stage', { p_room: g.roomId, p_cards: await hand(p, g.roomId) })
    await call(p, 'iknow_submit', { p_room: g.roomId })
    await call(g.keeper, 'iknow_judge', { p_room: g.roomId, p_ok: true })
    const rule = (await secret(g.roomId)).rule_id
    await call(p, 'iknow_guess', { p_room: g.roomId, p_rule: rule })
    let s = await state(g.roomId)
    const other = g.users.find((u) => u !== p && u !== g.keeper)!
    expect(s.result.deltas[g.ps.find((x) => x.user_id === other.uid)!.id]).toBe(-2)

    const keepers = [s.keeper_id]
    for (let i = 0; i < 2; i++) {
      await call(g.users[0], 'iknow_next_round', { p_room: g.roomId })
      s = await state(g.roomId)
      expect(keepers).not.toContain(s.keeper_id)
      keepers.push(s.keeper_id)
      expect(await hand(g.byPlayer(s.keeper_id), g.roomId)).toHaveLength(0)
      await admin.from('iknow_state').update({ phase: 'done' }).eq('room_id', g.roomId)
      await admin.from('rooms').update({ status: 'result' }).eq('id', g.roomId)
    }
    await call(g.users[0], 'iknow_next_round', { p_room: g.roomId })
    expect((await state(g.roomId)).phase).toBe('final')
    expect((await room(g.roomId)).status).toBe('game_over')
  })

  it('one last card that really cannot be played empties the hand and earns the guess', async () => {
    const g = await startGame(3)
    const p = await setUp(g)
    const cards = await hand(p, g.roomId)
    await admin.from('iknow_hands').delete().eq('room_id', g.roomId).eq('owner_user_id', p.uid).in('card', cards.slice(1))
    await call(p, 'iknow_cant_play', { p_room: g.roomId })
    await call(g.keeper, 'iknow_check', { p_room: g.roomId, p_card: null })
    const s = await state(g.roomId)
    expect(await hand(p, g.roomId)).toHaveLength(0)
    expect(s.phase).toBe('guessing')
    expect(s.guesser_id).toBe(g.ps.find((x) => x.user_id === p.uid)!.id)
  })

  it('a player leaving on their turn passes the turn; the keeper leaving aborts the round', async () => {
    const g = await startGame(4)
    const p = await setUp(g)
    const pid = g.ps.find((x) => x.user_id === p.uid)!.id
    await call(p, 'leave_room', { p_room: g.roomId })
    let s = await state(g.roomId)
    expect(s.turn_id).not.toBe(pid)
    expect(s.phase).toBe('turn')
    expect(Object.keys(s.hand_counts)).not.toContain(pid)
    await call(g.keeper, 'leave_room', { p_room: g.roomId })
    s = await state(g.roomId)
    expect(s.phase).toBe('done')
    expect(s.result).toEqual({ aborted: true })
  })
})
