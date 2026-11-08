import type { ReactNode } from 'react'
import { ANIMAL_TH, COLOR_HEX, COLOR_TH, decodeCard, type Animal } from '../../lib/iknow'

// One drawing at every size: a 120×168 SVG that scales with its width (like a printed card).

const INK = '#1d1b18'
const GLYPH_SIZE = [0, 66, 46, 40, 38, 32, 30] // fewer animals draw bigger
const ROWS = [[], [1], [2], [2, 1], [2, 2], [2, 2, 1], [2, 2, 2]]

function Glyph({ animal }: { animal: Animal }) {
  switch (animal) {
    case 'pig':
      return (
        <>
          <path d="M7 10 L9.5 4 L13.5 8.5 Z M25 10 L22.5 4 L18.5 8.5 Z" fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="16" cy="17" r="11" fill="#fff" stroke={INK} strokeWidth="2" />
          <ellipse cx="16" cy="20.5" rx="5" ry="3.6" fill="#F7B3CB" stroke={INK} strokeWidth="2" />
          <circle cx="14.2" cy="20.5" r="1" fill={INK} />
          <circle cx="17.8" cy="20.5" r="1" fill={INK} />
          <circle cx="11.5" cy="13.5" r="1.4" fill={INK} />
          <circle cx="20.5" cy="13.5" r="1.4" fill={INK} />
        </>
      )
    case 'dog':
      return (
        <>
          <circle cx="16" cy="17" r="10" fill="#fff" stroke={INK} strokeWidth="2" />
          <path d="M7.5 7.5 C3 9.5 3 18 6 21.5 C8.5 18.5 9.5 13 9.5 9.5 Z" fill="#8A5A3B" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M24.5 7.5 C29 9.5 29 18 26 21.5 C23.5 18.5 22.5 13 22.5 9.5 Z" fill="#8A5A3B" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="12.5" cy="15" r="1.4" fill={INK} />
          <circle cx="19.5" cy="15" r="1.4" fill={INK} />
          <ellipse cx="16" cy="20" rx="2.6" ry="1.9" fill={INK} />
          <path d="M16 22 v2.5" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        </>
      )
    case 'crow':
      return (
        <>
          <path d="M5 21 C5 13 11 8.5 18 9 C23 9.5 26 13 26 17 L31 18.5 L26 20.5 C25 25 20 27 14 27 L8.5 30 L10 25.5 C7 24.5 5 23.5 5 21 Z" fill="#2B2A33" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="21" cy="14.5" r="1.9" fill="#fff" />
          <path d="M11 19 C13.5 22.5 18 22.5 20.5 21" stroke="#6E6C80" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      )
    case 'hen':
      return (
        <>
          <path d="M11.5 7.5 C11 4 14.5 2.5 16 5 C17.5 2.5 21 3.5 19.5 7.5 Z" fill="#E0393E" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M8 20 C8 12 11 7 16 7 C21 7 23 11 23 14.5 C27.5 13.5 28.5 19 26.5 22 C24.5 26 19.5 28 15 28 C11 28 8 25 8 20 Z" fill="#fff" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M7.5 12.5 L3 14.5 L7.5 16 Z" fill="#F5A623" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="11.8" cy="12" r="1.4" fill={INK} />
          <path d="M8.6 17 C7.6 18 7.6 19.5 8.6 20.5" stroke="#E0393E" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </>
      )
  }
}

function glyphPositions(n: number) {
  const gs = GLYPH_SIZE[n]
  const rows = ROWS[n]
  const totalH = rows.length * gs + (rows.length - 1) * 4
  const out: { x: number; y: number; s: number }[] = []
  rows.forEach((k, r) => {
    const rowW = k * gs + (k - 1) * 4
    for (let i = 0; i < k; i++) out.push({ x: 60 - rowW / 2 + i * (gs + 4), y: 38 + (104 - totalH) / 2 + r * (gs + 4), s: gs / 32 })
  })
  return out
}

type Props = {
  card: number
  className?: string
  /** Ring colour (latest card, selected, …). */
  ring?: string
  faded?: boolean
  cross?: boolean
  children?: ReactNode
}

export function AnimalCard({ card, className = '', ring, faded, cross, children }: Props) {
  const c = decodeCard(card)
  return (
    <span
      className={`relative block shrink-0 rounded-[13%/9.3%] ${faded ? 'opacity-50' : ''} ${className}`}
      style={ring ? { boxShadow: `0 0 0 2px var(--bg), 0 0 0 5px ${ring}` } : undefined}
    >
      <svg viewBox="0 0 120 172" className="block w-full" role="img" aria-label={`${ANIMAL_TH[c.animal]} ${c.n} สี${COLOR_TH[c.color]}`}>
        <rect x="1.25" y="5" width="117.5" height="165.5" rx="16" fill={INK} />
        <rect x="1.25" y="1.25" width="117.5" height="165.5" rx="16" fill={COLOR_HEX[c.color]} stroke={INK} strokeWidth="2.5" />
        <text x="10" y="38" fontFamily="Fraunces, serif" fontWeight="800" fontSize="34" fill={INK}>
          {c.n}
        </text>
        <text x="110" y="26" textAnchor="end" fontFamily="Anuphan, sans-serif" fontWeight="700" fontSize="15" fill={INK}>
          {ANIMAL_TH[c.animal]}
        </text>
        {glyphPositions(c.n).map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y}) scale(${p.s})`}>
            <Glyph animal={c.animal} />
          </g>
        ))}
        <rect x="8" y="144" width={COLOR_TH[c.color].length * 9 + 10} height="17" rx="6" fill="rgba(255,255,255,.75)" />
        <text x="13" y="157" fontFamily="Anuphan, sans-serif" fontWeight="700" fontSize="12" fill={INK}>
          {COLOR_TH[c.color]}
        </text>
        <text x="110" y="148" textAnchor="end" fontFamily="Fraunces, serif" fontWeight="800" fontSize="20" fill={INK} transform="rotate(180 103 141)">
          {c.n}
        </text>
        {cross && <path d="M22 32 L98 140 M98 32 L22 140" stroke="#B8262B" strokeWidth="9" strokeLinecap="round" />}
      </svg>
      {children}
    </span>
  )
}

/** A fanned stack of face-down cards, one per card in hand, with the count beside it. */
export function HandFan({ count, size = 'sm' }: { count: number; size?: 'sm' | 'md' }) {
  const md = size === 'md'
  const cw = md ? 14 : 11
  const ch = md ? 20 : 16
  const step = md ? 5 : 4
  const spread = md ? 7 : 8
  return (
    <span className="inline-flex items-end gap-1.5" role="img" aria-label={`ในมือ ${count} ใบ`}>
      <span className="relative block" style={{ width: count ? cw + (count - 1) * step : 0, height: ch + 4 }}>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="absolute bottom-0 block box-border border-[1.5px] border-[#FFFBF3] shadow-[0_0_0_1px_#1d1b18]"
            style={{
              left: i * step,
              width: cw,
              height: ch,
              borderRadius: md ? 3 : 2.5,
              background: 'repeating-linear-gradient(135deg, #2B2A33 0 3px, #3A3946 3px 6px)',
              transform: `rotate(${(i - (count - 1) / 2) * spread}deg)`,
              transformOrigin: '50% 110%',
            }}
          />
        ))}
      </span>
      <span className={`num leading-none font-extrabold ${md ? 'text-base' : 'text-[13px]'}`}>{count}</span>
    </span>
  )
}

/** The purple secret-rule card. Difficulty is for the keeper's eyes only. */
export function RuleCard({ text, level, label, className = '', big = false }: { text: string; level?: number; label?: string; className?: string; big?: boolean }) {
  return (
    <div className={`rounded-[18px] border-2 border-[#1d1b18] bg-[#4B2E83] p-3 text-white shadow-[0_3px_0_#1d1b18] ${className}`}>
      {label && <p className="mb-2 text-xs font-bold text-[#E6DDF5]">{label}</p>}
      <p className={`rounded-xl bg-[#FFFBF3] px-3 py-2.5 font-bold text-[#1d1b18] ${big ? 'text-xl' : 'text-base'}`}>{text}</p>
      {level != null && <Difficulty level={level} className="mt-2" />}
    </div>
  )
}

export function Difficulty({ level, className = '' }: { level: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`} aria-label={`ความยาก ${level} จาก 5`}>
      <span className="text-xs text-[#E6DDF5]">ความยาก</span>
      <span className="grid grid-cols-5 gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="block h-1.5 w-4 rounded-full" style={{ background: i <= level ? '#F7B3CB' : 'rgba(255,255,255,.22)' }} />
        ))}
      </span>
    </span>
  )
}
