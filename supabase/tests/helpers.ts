import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

function localEnv(): Record<string, string> {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  return Object.fromEntries(
    out
      .split('\n')
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m![1], m![2]]),
  )
}

const env = localEnv()
export const URL = env.API_URL
const ANON = env.ANON_KEY
const SERVICE = env.SERVICE_ROLE_KEY

export type Client = SupabaseClient & { uid: string }

export async function newUser(): Promise<Client> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } }) as Client
  const { data, error } = await c.auth.signInAnonymously()
  if (error) throw error
  c.uid = data.user!.id
  // Realtime must use the user's JWT so RLS applies to change payloads.
  c.realtime.setAuth(data.session!.access_token)
  return c
}

export const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })

/** Calls an RPC and throws the raised error code on failure. */
export async function call<T = unknown>(c: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await c.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function expectCode(p: Promise<unknown>, code: string) {
  try {
    await p
  } catch (e) {
    if ((e as Error).message === code) return
    throw new Error(`expected ${code}, got ${(e as Error).message}`)
  }
  throw new Error(`expected ${code}, but call succeeded`)
}

export async function room(roomId: string) {
  const { data } = await admin.from('rooms').select('*').eq('id', roomId).single()
  return data
}

export async function players(roomId: string) {
  const { data } = await admin.from('players').select('*').eq('room_id', roomId).order('seat')
  return data ?? []
}

export async function myHand(c: Client, roomId: string) {
  const { data } = await c.from('hands').select('card_id, value, owner_user_id, round').eq('room_id', roomId)
  return data ?? []
}

/** Creates a room with `n` players (first is host) and returns them. */
export async function setupRoom(n: number) {
  const users: Client[] = []
  for (let i = 0; i < n; i++) users.push(await newUser())
  const { room_id: roomId, code } = await call<{ room_id: string; code: string }>(users[0], 'create_room', { p_name: 'โฮสต์' })
  for (let i = 1; i < n; i++) await call(users[i], 'join_room', { p_code: code, p_name: `ผู้เล่น${i}` })
  return { users, roomId, code, host: users[0] }
}

/** Places each user's cards. order: 'asc' (perfect) or a custom comparator on values. */
export async function placeAll(users: Client[], roomId: string, order: 'asc' | 'desc' = 'asc') {
  const all: { c: Client; card_id: string; value: number }[] = []
  for (const c of users) for (const h of await myHand(c, roomId)) all.push({ c, card_id: h.card_id, value: h.value })
  all.sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value))
  for (let i = 0; i < all.length; i++) await call(all[i].c, 'move_card', { p_card: all[i].card_id, p_position: i + 1 })
  return all
}

export async function playToRevealing(users: Client[], roomId: string, order: 'asc' | 'desc' = 'asc') {
  await call(users[0], 'confirm_theme', { p_room: roomId })
  const placed = await placeAll(users, roomId, order)
  for (const c of users) await call(c, 'lock_in', { p_room: roomId, p_locked: true })
  return placed
}

export async function revealEverything(host: Client, roomId: string) {
  for (let guard = 0; guard < 200; guard++) {
    const r = await room(roomId)
    if (r.status !== 'revealing') return r
    await call(host, 'reveal_next', { p_room: roomId, p_expected: r.reveal_index })
  }
  throw new Error('reveal did not finish')
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
