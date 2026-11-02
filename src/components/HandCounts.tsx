import { AnimatePresence, motion } from 'motion/react'
import type { BoardCard, Player } from '../lib/types'
import { PlayerAvatar } from './PlayerAvatar'

type Props = {
  players: Player[] // active players in seat order
  board: BoardCard[] // current round
  myPlayerId: string
  show: boolean
}

/**
 * Each player's avatar with a mini card stack showing how many of their cards are still face down
 * (in hand or on the table), or a faded ✓ once they have flipped them all.
 */
export function HandCounts({ players, board, myPlayerId, show }: Props) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.ul
          key="hand-counts"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          className="flex flex-wrap justify-center gap-x-4 gap-y-1 overflow-hidden pt-1 pb-1.5"
          aria-label="การ์ดที่ยังไม่เปิดของแต่ละคน"
        >
          {players.map((p) => {
            const left = board.filter((c) => c.owner_player_id === p.id && c.revealed_value == null).length
            const name = p.id === myPlayerId ? 'คุณ' : p.name
            return (
              <li key={p.id} className="flex w-12 flex-col items-center" aria-label={left ? `${name} เหลือ ${left} ใบที่ยังไม่เปิด` : `${name} เปิดครบแล้ว`}>
                <span className="relative">
                  <span className={left ? '' : 'opacity-45'}>
                    <PlayerAvatar player={p} size="sm" />
                  </span>
                  {left > 0 ? <MiniStack count={left} /> : <Done />}
                </span>
                <span className="mt-0.5 w-full truncate text-center text-[11px] leading-tight text-ink-muted">{name}</span>
              </li>
            )
          })}
        </motion.ul>
      )}
    </AnimatePresence>
  )
}

function MiniStack({ count }: { count: number }) {
  return (
    <span className="absolute -right-2.5 -bottom-1 h-5 w-4" aria-hidden="true">
      {count > 1 && <span className="absolute top-0.5 left-0 h-4 w-3 -rotate-12 rounded-[3px] border-[1.5px] border-ink bg-surface" />}
      <motion.span
        key={count}
        initial={{ scale: 1.4 }}
        animate={{ scale: 1 }}
        className="num absolute top-0 left-1 grid h-4 w-3 place-items-center rounded-[3px] border-[1.5px] border-ink bg-surface text-[9px] leading-none font-bold"
      >
        {count}
      </motion.span>
    </span>
  )
}

function Done() {
  return (
    <span
      className="absolute -right-1.5 -bottom-1 grid size-4 place-items-center rounded-full border-2 border-bg bg-success text-[9px] font-bold text-white"
      aria-hidden="true"
    >
      ✓
    </span>
  )
}
