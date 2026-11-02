import type { Theme } from '../data/themes'

/** Pinned at the top of every in-round screen (§2.7 rule 1). */
export function TopicBar({ theme }: { theme: Theme | null }) {
  if (!theme) return null
  return (
    <div className="rounded-btn border border-line bg-surface px-4 py-2.5 shadow-card">
      <p className="text-xs font-bold text-ink-muted">หัวข้อ</p>
      <p className="text-base leading-snug font-bold">{theme.title}</p>
      <ScaleLine low={theme.low} high={theme.high} compact />
    </div>
  )
}

export function ScaleLine({ low, high, compact = false }: { low: string; high: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? 'mt-1 text-xs' : 'mt-4 text-sm'}`} aria-label={`1 คือ ${low} ถึง 100 คือ ${high}`}>
      <span className="num font-bold text-ink-muted">1</span>
      <span className="min-w-0 flex-1 truncate text-ink-muted">{low}</span>
      <span className="relative h-0.5 w-8 shrink-0 rounded-full bg-thread" aria-hidden="true">
        <span className="absolute -top-[3px] -left-0.5 size-2 rounded-full bg-thread" />
        <span className="absolute -top-[3px] -right-0.5 size-2 rounded-full bg-thread" />
      </span>
      <span className="min-w-0 flex-1 truncate text-right text-ink-muted">{high}</span>
      <span className="num font-bold text-ink-muted">100</span>
    </div>
  )
}
