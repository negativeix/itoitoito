import { describe, expect, it } from 'vitest'
import { between, positionAt } from './fractional'

describe('fractional positions', () => {
  it('starts at 1 on an empty table', () => {
    expect(between(null, null)).toBe(1)
  })

  it('goes before the first and after the last card', () => {
    expect(between(null, 1)).toBe(0)
    expect(between(5, null)).toBe(6)
  })

  it('lands strictly between neighbours', () => {
    const p = between(1, 2)
    expect(p).toBeGreaterThan(1)
    expect(p).toBeLessThan(2)
  })

  it('positionAt inserts at the requested index', () => {
    const sorted = [1, 2, 3]
    expect(positionAt(sorted, 0)).toBeLessThan(1)
    expect(positionAt(sorted, 1)).toBe(1.5)
    expect(positionAt(sorted, 3)).toBe(4)
    expect(positionAt(sorted, 99)).toBe(4)
  })

  it('survives many repeated insertions at the same spot', () => {
    let lo = 1
    const hi = 2
    for (let i = 0; i < 40; i++) {
      const p = between(lo, hi)
      expect(p).toBeGreaterThan(lo)
      expect(p).toBeLessThan(hi)
      lo = p
    }
  })
})
