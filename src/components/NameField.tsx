import { forwardRef } from 'react'

type Props = { value: string; onChange: (v: string) => void; error?: string | null; onEnter?: () => void }

export const NameField = forwardRef<HTMLInputElement, Props>(function NameField({ value, onChange, error, onEnter }, ref) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-sm font-bold text-ink-muted">ชื่อเล่นของคุณ</span>
      <input
        ref={ref}
        value={value}
        maxLength={16}
        autoComplete="nickname"
        enterKeyHint="go"
        placeholder="เช่น บอส"
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        className={`h-14 w-full rounded-btn border-2 bg-surface px-4 text-lg outline-none focus:border-thread ${error ? 'border-danger' : 'border-line'}`}
      />
      {error && <span className="mt-1 block text-sm font-medium text-danger-ink">{error}</span>}
    </label>
  )
})
