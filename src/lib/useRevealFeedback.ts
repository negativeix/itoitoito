import { useEffect, useRef } from 'react'
import type { BoardCard } from './types'
import { haptics } from './haptics'
import { sound } from './sound'

/** Flip sound, a rising note for each correct card, a low thud + buzz for wrong ones (§2.6). */
export function useRevealFeedback(cards: BoardCard[]) {
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    const revealed = cards.filter((c) => c.revealed_value != null && c.reveal_order != null).sort((a, b) => a.reveal_order! - b.reveal_order!)
    if (!seen.current) {
      // First render (e.g. rejoining mid-round): don't replay old cards.
      seen.current = new Set(revealed.map((c) => c.card_id))
      return
    }
    const fresh = revealed.filter((c) => !seen.current!.has(c.card_id))
    fresh.forEach((c, i) => {
      seen.current!.add(c.card_id)
      const step = revealed.filter((x) => x.is_wrong === false && x.reveal_order! <= c.reveal_order!).length - 1
      window.setTimeout(() => {
        sound.flip()
        window.setTimeout(() => {
          if (c.is_wrong) {
            sound.wrong()
            haptics.wrong()
          } else if (c.is_wrong === false) {
            sound.correct(step)
            haptics.tap()
          }
        }, 160)
      }, i * 120)
    })
  }, [cards])
}
