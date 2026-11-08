import { describe, expect, it } from 'vitest'
import { IK_RULES } from '../data/iknowRules'
import { decodeCard, encodeCard } from './iknow'

describe('ใครไม่รู้ cards and rules', () => {
  it('72 distinct cards: 4 animals × 6 numbers × 3 colours, round-trip encoded', () => {
    const seen = new Set<string>()
    for (let id = 0; id < 72; id++) {
      const c = decodeCard(id)
      expect(encodeCard(c.animal, c.n, c.color)).toBe(id)
      seen.add(`${c.animal}-${c.n}-${c.color}`)
    }
    expect(seen.size).toBe(72)
  })

  it('has exactly 60 rules with ids 1..60 (the server picks from that range)', () => {
    expect(IK_RULES).toHaveLength(60)
    expect(IK_RULES.map((r) => r.id)).toEqual([...Array(60).keys()].map((i) => i + 1))
    expect(new Set(IK_RULES.map((r) => r.text)).size).toBe(60)
    for (const r of IK_RULES) expect([1, 2, 3, 4, 5]).toContain(r.level)
  })
})
