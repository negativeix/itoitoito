import type { GameMode } from './types'
import { supabase } from './supabase'

const MESSAGES: Record<string, string> = {
  not_authenticated: 'กำลังเตรียมเครื่องของคุณ ลองอีกครั้งนะ',
  room_not_found: 'ไม่เจอห้องนี้ ลองเช็กโค้ดอีกทีนะ',
  room_full: 'ห้องเต็มแล้ว (สูงสุด 10 คน)',
  not_in_room: 'คุณไม่ได้อยู่ในห้องนี้แล้ว',
  not_host: 'ปุ่มนี้สำหรับเจ้าของห้องเท่านั้น',
  wrong_phase: 'ตอนนี้ทำแบบนั้นไม่ได้แล้ว',
  need_two_players: 'ต้องมีผู้เล่นอย่างน้อย 2 คน',
  invalid_name: 'ใส่ชื่อเล่นก่อนนะ',
  invalid_color: 'เลือกสีนี้ไม่ได้',
  color_taken: 'สีนี้มีคนใช้แล้ว',
  invalid_settings: 'การตั้งค่าไม่ถูกต้อง',
  no_rerolls_left: 'เปลี่ยนหัวข้อครบ 2 ครั้งแล้ว',
  invalid_theme: 'กรอกหัวข้อและปลายสเกลทั้งสองฝั่งให้ครบ',
  not_enough_cards: 'เลขในสำรับไม่พอสำหรับทุกคน',
  cards_not_placed: 'วางการ์ดให้ครบก่อนนะ',
  not_your_card: 'ย้ายได้เฉพาะการ์ดของตัวเอง',
  card_not_found: 'ไม่เจอการ์ดใบนี้แล้ว',
  clue_too_long: 'คำใบ้ยาวได้ไม่เกิน 24 ตัวอักษร',
  spectating: 'คุณเข้ามากลางรอบ รอเล่นรอบถัดไปนะ',
  host_still_here: 'เจ้าของห้องยังอยู่',
  player_not_found: 'ไม่เจอผู้เล่นคนนี้แล้ว',
  cannot_kick_self: 'เชิญตัวเองออกไม่ได้',
  invalid_position: 'วางตรงนั้นไม่ได้',
  no_free_code: 'ตอนนี้ห้องเต็มระบบ ลองใหม่อีกครั้ง',
  network: 'เน็ตหลุด ลองอีกครั้งนะ',
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  const raw = (err as { message?: string })?.message ?? ''
  const code = Object.keys(MESSAGES).find((c) => raw === c || raw.startsWith(c + ' ')) ?? (/fetch|network|Failed/i.test(raw) ? 'network' : 'unknown')
  return new ApiError(code, MESSAGES[code] ?? 'มีบางอย่างผิดพลาด ลองอีกครั้งนะ')
}

async function rpc<T = void>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  let res
  try {
    res = await supabase.rpc(fn, args)
  } catch (e) {
    throw toApiError(e)
  }
  if (res.error) throw toApiError(res.error)
  return res.data as T
}

type RoomRef = { room_id: string; code: string }

export const api = {
  createRoom: (name: string) => rpc<RoomRef>('create_room', { p_name: name }),
  joinRoom: (code: string, name: string) => rpc<RoomRef & { rejoined: boolean }>('join_room', { p_code: code, p_name: name }),
  myRoom: () => rpc<RoomRef | null>('my_room'),
  leaveRoom: (roomId: string) => rpc('leave_room', { p_room: roomId }),
  kickPlayer: (roomId: string, playerId: string) => rpc('kick_player', { p_room: roomId, p_player: playerId }),
  setColor: (roomId: string, color: string) => rpc('set_color', { p_room: roomId, p_color: color }),
  updateSettings: (roomId: string, mode: GameMode, cards: number, categories: string[]) =>
    rpc('update_settings', { p_room: roomId, p_mode: mode, p_cards: cards, p_categories: categories }),
  transferHost: (roomId: string, toPlayerId: string | null = null) => rpc('transfer_host', { p_room: roomId, p_to: toPlayerId }),
  heartbeat: (roomId: string) => rpc('heartbeat', { p_room: roomId }),
  startRound: (roomId: string) => rpc('start_round', { p_room: roomId }),
  nextRound: (roomId: string) => rpc('next_round', { p_room: roomId }),
  backToLobby: (roomId: string) => rpc('back_to_lobby', { p_room: roomId }),
  voteReroll: (roomId: string) => rpc('vote_reroll', { p_room: roomId }),
  setCustomTheme: (roomId: string, title: string, low: string, high: string) =>
    rpc('set_custom_theme', { p_room: roomId, p_title: title, p_low: low, p_high: high }),
  confirmTheme: (roomId: string) => rpc('confirm_theme', { p_room: roomId }),
  moveCard: (cardId: string, position: number | null) => rpc('move_card', { p_card: cardId, p_position: position }),
  setClue: (cardId: string, clue: string) => rpc('set_clue', { p_card: cardId, p_clue: clue }),
  lockIn: (roomId: string, locked: boolean) => rpc('lock_in', { p_room: roomId, p_locked: locked }),
  revealNext: (roomId: string, expected: number) => rpc<number>('reveal_next', { p_room: roomId, p_expected: expected }),
  revealAll: (roomId: string) => rpc('reveal_all', { p_room: roomId }),
}
