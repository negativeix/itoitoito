import { motion, useReducedMotion } from 'motion/react'
import { flipTransition, paperSpring } from '../lib/motion'
import { inkOn } from '../lib/players'
import { ThreadCoil } from './ThreadCoil'

type CardProps = {
  /** Card value shown on the face. Leave undefined for a card whose value we don't know. */
  value?: number | null
  /** Show the face (number) instead of the back. */
  faceUp?: boolean
  /** The red "0" card that starts the thread. */
  zero?: boolean
  /** Owner's player color (top strip). */
  color?: string
  /** Owner's initial, always shown with the color. */
  initials?: string
  /** Mark as the viewer's own card: red-thread ring + "ของฉัน" tag. */
  mine?: boolean
  /** Revealed out of order. */
  wrong?: boolean
  /** Being dragged: lift and tilt. */
  lifted?: boolean
  /** Width is set by the caller (e.g. "w-28"); height follows the 5:7 ratio. */
  className?: string
  label?: string
}

const cardShell = 'absolute inset-0 overflow-hidden rounded-card border bg-surface [backface-visibility:hidden]'

export function Card({
  value,
  faceUp = false,
  zero = false,
  color = 'var(--ink-muted)',
  initials = '',
  mine = false,
  wrong = false,
  lifted = false,
  className = 'w-28',
  label,
}: CardProps) {
  const reduce = useReducedMotion()

  if (zero) {
    return (
      <div
        className={`relative aspect-[5/7] shrink-0 [container-type:inline-size] ${className}`}
        role="img"
        aria-label={label ?? 'การ์ด 0 จุดเริ่มต้น'}
      >
        <div className="absolute inset-0 rounded-card bg-thread shadow-card">
          <Corners text="0" ink="#fff" />
          <div className="num absolute inset-0 grid place-items-center text-[46cqw] leading-none font-bold text-white">0</div>
        </div>
      </div>
    )
  }

  const showFace = faceUp && value != null
  const ariaLabel = label ?? (showFace ? `การ์ดเลข ${value}` : initials ? `การ์ดคว่ำของ ${initials}` : 'การ์ดคว่ำ')
  const borderClass = wrong ? 'border-2 border-danger' : 'border-line'

  const face = (
    <div className={`${cardShell} ${borderClass}`} style={reduce ? undefined : { transform: 'rotateY(180deg)' }}>
      <Strip color={color} initials={initials} />
      {showFace && (
        <>
          <Corners text={String(value)} ink="var(--ink)" offsetTop />
          <div
            className={`num absolute inset-0 grid place-items-center pt-[8%] leading-none font-bold text-ink ${
              value === 100 ? 'text-[36cqw]' : 'text-[46cqw]'
            }`}
          >
            {value}
          </div>
        </>
      )}
    </div>
  )

  const back = (
    <div className={`${cardShell} ${borderClass}`}>
      <Strip color={color} initials={initials} />
      <div className="absolute inset-[18%_9%_7%] grid place-items-center rounded-[12px] border border-dashed border-line">
        <ThreadCoil width={100} height={44} loops={3} strokeWidth={3} className="w-[80%]" />
      </div>
    </div>
  )

  return (
    <motion.div
      className={`relative aspect-[5/7] shrink-0 [container-type:inline-size] [perspective:900px] ${className}`}
      role="img"
      aria-label={ariaLabel}
      animate={lifted ? { scale: 1.06, rotate: 3, y: -6 } : { scale: 1, rotate: 0, y: 0 }}
      transition={paperSpring}
    >
      {reduce ? (
        <div className={`absolute inset-0 rounded-card ${lifted ? 'shadow-lift' : 'shadow-card'}`}>
          {back}
          <motion.div className="absolute inset-0" initial={false} animate={{ opacity: showFace ? 1 : 0 }} transition={{ duration: 0.2 }}>
            {face}
          </motion.div>
        </div>
      ) : (
        <motion.div
          className={`absolute inset-0 rounded-card [transform-style:preserve-3d] ${lifted ? 'shadow-lift' : 'shadow-card'}`}
          initial={false}
          animate={{ rotateY: showFace ? 180 : 0, scale: showFace ? 1.05 : 1 }}
          transition={flipTransition}
        >
          {back}
          {face}
        </motion.div>
      )}

      {mine && (
        <>
          <div className="pointer-events-none absolute -inset-[5px] rounded-[25px] border-[3px] border-thread" aria-hidden="true" />
          <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-thread px-2 text-xs font-bold whitespace-nowrap text-white">
            ของฉัน
          </span>
        </>
      )}
    </motion.div>
  )
}

function Strip({ color, initials }: { color: string; initials: string }) {
  return (
    <div className="absolute inset-x-0 top-0 flex h-[13%] items-center px-[7%]" style={{ background: color }}>
      {initials && (
        <span className="text-[9cqw] leading-none font-bold" style={{ color: color.startsWith('#') ? inkOn(color) : '#fff' }}>
          {initials}
        </span>
      )}
    </div>
  )
}

function Corners({ text, ink, offsetTop = false }: { text: string; ink: string; offsetTop?: boolean }) {
  const cls = 'num absolute text-[11cqw] leading-none font-semibold'
  return (
    <>
      <span className={`${cls} left-[8%] ${offsetTop ? 'top-[17%]' : 'top-[6%]'}`} style={{ color: ink }}>
        {text}
      </span>
      <span className={`${cls} right-[8%] bottom-[6%] rotate-180`} style={{ color: ink }}>
        {text}
      </span>
    </>
  )
}
