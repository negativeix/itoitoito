const RULES = ['ห้ามบอกเลข', 'ห้ามบอกช่วง เช่น "สูงๆ"', 'ห้ามโชว์จอ', 'พูดเป็นตัวอย่างตามหัวข้อ']

/** On-screen rule reminders (§1.3). */
export function RuleChips() {
  return (
    <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="กติกา">
      {RULES.map((r) => (
        <li key={r} className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium whitespace-nowrap text-ink-muted">
          {r}
        </li>
      ))}
    </ul>
  )
}
