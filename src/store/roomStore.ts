import { create } from 'zustand'
import type { IkSecret, IkState } from '../lib/iknow'
import type { BoardCard, HandCard, Player, Room } from '../lib/types'

export type Connection = 'connecting' | 'online' | 'reconnecting'
export type Ghost = { index: number | null; at: number }

type RoomState = {
  userId: string | null
  room: Room | null
  players: Player[]
  board: BoardCard[]
  hand: HandCard[]
  /** user ids currently present on the realtime channel */
  online: string[]
  connection: Connection
  /** Other players' in-progress drags (broadcast, not persisted): card id → insertion index. */
  ghosts: Record<string, Ghost>
  /** Optimistic positions awaiting move_card. */
  pending: Record<string, number | null>
  /** Set when this device was removed from the room (kicked, room deleted). */
  removed: boolean
  /** ใครไม่รู้: public state, my hand (card codes) and whatever the server lets me see. */
  ik: IkState | null
  ikHand: number[]
  ikSecret: IkSecret

  setSnapshot: (s: { room: Room; players: Player[]; board: BoardCard[]; hand: HandCard[] }) => void
  patchRoom: (room: Partial<Room> & { id: string }) => void
  upsertPlayer: (p: Player) => void
  removePlayer: (id: string) => void
  upsertCard: (c: BoardCard) => void
  removeCard: (cardId: string) => void
  set: (partial: Partial<RoomState>) => void
  setGhost: (cardId: string, index: number | null) => void
  setPending: (cardId: string, position: number | null) => void
  clearPending: (cardId: string) => void
  reset: () => void
}

const empty = {
  room: null,
  players: [],
  board: [],
  hand: [],
  online: [],
  connection: 'connecting' as Connection,
  ghosts: {},
  pending: {},
  removed: false,
  ik: null as IkState | null,
  ikHand: [] as number[],
  ikSecret: {} as IkSecret,
}

export const useRoom = create<RoomState>((set, get) => ({
  userId: null,
  ...empty,

  setSnapshot: ({ room, players, board, hand }) => set({ room, players, board, hand }),
  patchRoom: (patch) => {
    const room = get().room
    if (room && room.id === patch.id) set({ room: { ...room, ...patch } })
  },
  upsertPlayer: (p) => {
    const players = get().players.filter((x) => x.id !== p.id)
    set({ players: [...players, p].sort((a, b) => a.seat - b.seat) })
  },
  removePlayer: (id) => set({ players: get().players.filter((p) => p.id !== id) }),
  upsertCard: (c) => {
    const board = get().board.filter((x) => x.card_id !== c.card_id)
    set({ board: [...board, c] })
  },
  removeCard: (cardId) => set({ board: get().board.filter((c) => c.card_id !== cardId) }),
  set: (partial) => set(partial),
  setGhost: (cardId, index) => set({ ghosts: { ...get().ghosts, [cardId]: { index, at: Date.now() } } }),
  setPending: (cardId, position) => set({ pending: { ...get().pending, [cardId]: position } }),
  clearPending: (cardId) => {
    const { [cardId]: _, ...rest } = get().pending
    set({ pending: rest })
  },
  reset: () => set({ ...empty }),
}))

// ---- derived helpers (pure, used with selectors) ----

export const activePlayers = (players: Player[]) => players.filter((p) => !p.left_at && !p.spectating)

export function myPlayer(s: Pick<RoomState, 'players' | 'userId'>) {
  return s.players.find((p) => p.user_id === s.userId) ?? null
}

/** Board with optimistic positions applied, current round only. */
export function effectiveBoard(s: Pick<RoomState, 'board' | 'pending' | 'room'>): BoardCard[] {
  const round = s.room?.round
  return s.board
    .filter((c) => c.round === round)
    .map((c) => (c.card_id in s.pending ? { ...c, position: s.pending[c.card_id] } : c))
}

/** Placed cards in table order (by position, ties by id — same as the server's reveal order). */
export function tableOrder(cards: BoardCard[]): BoardCard[] {
  return cards
    .filter((c) => c.position != null)
    .sort((a, b) => a.position! - b.position! || (a.card_id < b.card_id ? -1 : 1))
}
