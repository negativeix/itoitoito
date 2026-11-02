import { describe, expect, it } from 'vitest'
import { CATEGORIES, THEMES } from './themes'

describe('theme library (§7)', () => {
  it('has at least 25 themes per category', () => {
    for (const c of CATEGORIES) {
      expect(THEMES.filter((t) => t.category === c).length, c).toBeGreaterThanOrEqual(25)
    }
  })

  it('has unique ids and titles', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
    expect(new Set(THEMES.map((t) => t.title)).size).toBe(THEMES.length)
  })

  it('keeps scale ends short enough for the topic bar', () => {
    for (const t of THEMES) {
      expect(t.low.length, t.id).toBeLessThanOrEqual(24)
      expect(t.high.length, t.id).toBeLessThanOrEqual(24)
      expect(t.low, t.id).not.toBe(t.high)
    }
  })
})
