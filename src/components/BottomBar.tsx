import type { ReactNode } from 'react'

/** Sticky thumb-zone area for the screen's single primary action (§2.3, §2.7 rule 2). */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="safe-bottom sticky bottom-0 z-30 -mx-4 mt-auto bg-gradient-to-t from-bg via-bg to-bg/0 px-4 pt-6">
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}
