import { useRef } from 'react'

const ALLOWED = /[A-HJ-NP-Z]/ // room codes never use I or O

export function sanitizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((c) => ALLOWED.test(c))
    .join('')
    .slice(0, 4)
}

/** Four big letter boxes with auto-advance, backspace and paste support. */
export function CodeInput({ value, onChange, onComplete }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const setAt = (i: number, ch: string) => {
    const chars = value.padEnd(4, ' ').split('')
    chars[i] = ch || ' '
    const next = chars.join('').replace(/\s+$/, '').replace(/\s/g, '')
    onChange(next)
    return next
  }

  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="โค้ดห้อง 4 ตัว">
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={value[i] ?? ''}
          autoFocus={i === Math.min(value.length, 3)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={4}
          aria-label={`ตัวที่ ${i + 1}`}
          className="num h-16 w-full rounded-btn border-2 border-line bg-bg text-center text-2xl font-bold uppercase outline-none focus:border-thread"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const clean = sanitizeCode(e.target.value)
            if (clean.length > 1) {
              // Pasted or autofilled several letters.
              const next = sanitizeCode(value.slice(0, i) + clean)
              onChange(next)
              refs.current[Math.min(next.length, 3)]?.focus()
              if (next.length === 4) onComplete?.(next)
              return
            }
            const next = setAt(i, clean)
            if (clean && i < 3) refs.current[i + 1]?.focus()
            if (next.length === 4) onComplete?.(next)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) {
              setAt(i - 1, '')
              refs.current[i - 1]?.focus()
            }
          }}
          onPaste={(e) => {
            const clean = sanitizeCode(e.clipboardData.getData('text'))
            if (!clean) return
            e.preventDefault()
            onChange(clean)
            refs.current[Math.min(clean.length, 3)]?.focus()
            if (clean.length === 4) onComplete?.(clean)
          }}
        />
      ))}
    </div>
  )
}
