type Option<T extends string | number> = { value: T; label: string }

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  label: string
  disabled?: boolean
}) {
  return (
    <div
      className="grid gap-1 rounded-btn bg-surface-2 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`min-h-12 rounded-[12px] px-2 text-sm font-bold transition-colors disabled:cursor-default ${
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-ink-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
