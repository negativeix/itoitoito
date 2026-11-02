import { initialOf, inkOn } from '../lib/players'
import type { Player } from '../lib/types'
import { IconCrown } from './icons'

type Props = {
  player: Pick<Player, 'name' | 'color'>
  size?: 'sm' | 'md' | 'lg'
  online?: boolean
  host?: boolean
  me?: boolean
  className?: string
}

const sizes = { sm: 'size-8 text-sm', md: 'size-12 text-lg', lg: 'size-16 text-2xl' }

/** Colored circle + initial (never color alone, §2.1), with optional online dot and host crown. */
export function PlayerAvatar({ player, size = 'md', online, host, me, className = '' }: Props) {
  return (
    <span className={`relative inline-grid shrink-0 ${className}`}>
      <span
        className={`grid place-items-center rounded-full font-bold ${sizes[size]} ${me ? 'ring-[3px] ring-thread ring-offset-2 ring-offset-bg' : ''}`}
        style={{ background: player.color, color: inkOn(player.color) }}
        aria-hidden="true"
      >
        {initialOf(player.name)}
      </span>
      {host && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[#E9B92F] drop-shadow-sm">
          <IconCrown />
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute right-0 bottom-0 size-3.5 rounded-full border-2 border-bg ${online ? 'bg-success' : 'bg-ink-muted/50'}`}
          aria-hidden="true"
        />
      )}
    </span>
  )
}
