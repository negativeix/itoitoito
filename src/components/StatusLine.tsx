import type { ReactNode } from 'react'

/** Always says what we're waiting for (§2.7 rule 3). */
export function StatusLine({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'thread' | 'success' | 'danger' }) {
  const color = { muted: 'text-ink-muted', thread: 'text-thread-ink', success: 'text-success-ink', danger: 'text-danger-ink' }[tone]
  return (
    <p className={`min-h-6 text-center text-sm font-medium ${color}`} role="status" aria-live="polite">
      {children}
    </p>
  )
}

/** "บอส, มิ้นท์ และอีก 2 คน" */
export function nameList(names: string[], max = 3): string {
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} และอีก ${names.length - max} คน`
}
