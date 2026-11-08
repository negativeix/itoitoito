import type { Theme } from '../data/themes'

export type RoomStatus = 'lobby' | 'choosing_theme' | 'placing' | 'result' | 'game_over'
export type GameMode = 'classic' | 'levelup'
export type GameKind = 'ito' | 'iknow'

export type RoundResult = {
  wrong: number
  total: number
  perfect: boolean
  lives_before: number
  lives_after: number
  level: number
  deck_complete: boolean
}

export type Room = {
  id: string
  code: string
  status: RoomStatus
  mode: GameMode
  game: GameKind
  host_user_id: string
  cards_per_player: number
  level: number
  lives: number
  round: number
  current_theme: Theme | null
  theme_history: Theme[]
  reveal_index: number
  last_result: RoundResult | null
  roster_version: number
  updated_at: string
}

export type Player = {
  id: string
  room_id: string
  user_id: string
  name: string
  color: string
  seat: number
  spectating: boolean
  left_at: string | null
}

export type BoardCard = {
  card_id: string
  room_id: string
  round: number
  owner_player_id: string
  position: number | null
  clue: string | null
  reveal_order: number | null
  revealed_value: number | null
  is_wrong: boolean | null
}

/** One of my own cards: the secret value lives only here, keyed by card id. */
export type HandCard = { card_id: string; round: number; value: number }
