// ใครไม่รู้: card encoding and the public game state (mirrors 0007_iknow.sql).

export type Animal = 'pig' | 'dog' | 'crow' | 'hen'
export type CardColor = 'pink' | 'blue' | 'yellow'

const ANIMALS: Animal[] = ['pig', 'dog', 'crow', 'hen']
const COLORS: CardColor[] = ['pink', 'blue', 'yellow']

export const ANIMAL_TH: Record<Animal, string> = { pig: 'หมู', dog: 'หมา', crow: 'กา', hen: 'ไก่' }
export const COLOR_TH: Record<CardColor, string> = { pink: 'ชมพู', blue: 'ฟ้า', yellow: 'เหลือง' }
export const COLOR_HEX: Record<CardColor, string> = { pink: '#F7B3CB', blue: '#9AD3F2', yellow: '#F8D664' }

export type IkCard = { id: number; animal: Animal; n: number; color: CardColor }

/** card = animal * 18 + (number - 1) * 3 + colour, 0..71 */
export function decodeCard(id: number): IkCard {
  return { id, animal: ANIMALS[Math.floor(id / 18)], n: Math.floor((id % 18) / 3) + 1, color: COLORS[id % 3] }
}

export function encodeCard(animal: Animal, n: number, color: CardColor): number {
  return ANIMALS.indexOf(animal) * 18 + (n - 1) * 3 + COLORS.indexOf(color)
}

export function cardLabel(id: number): string {
  const c = decodeCard(id)
  return `${ANIMAL_TH[c.animal]} ${c.n} ${COLOR_TH[c.color]}`
}

export type IkPhase = 'idle' | 'pick_rule' | 'pick_start' | 'turn' | 'judging' | 'checking' | 'guessing' | 'guess_wrong' | 'done' | 'final'

export type IkState = {
  room_id: string
  round: number
  phase: IkPhase
  keeper_id: string | null
  turn_id: string | null
  guesser_id: string | null
  check_id: string | null
  emptied_id: string | null
  table_cards: number[]
  staging: number[]
  rejected: { p: string; cards: number[]; t: number }[]
  hand_counts: Record<string, number>
  scores: Record<string, number>
  keepers_done: string[]
  wrong_guesses: { p: string; rule: number }[]
  last_check: { p: string; card: number | null; n?: number; t: number } | null
  result:
    | { aborted: true }
    | { aborted?: undefined; guesser: string; rule: number; options: number[]; deltas: Record<string, number>; counts: Record<string, number> }
    | null
  turn_no: number
  version: number
}

/** What the server lets this player see (see iknow_secret). */
export type IkSecret = {
  rule?: number | null
  rule_options?: number[] | null
  deck?: number[] | null
  check_hand?: number[] | null
  guess_options?: number[] | null
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'
}
