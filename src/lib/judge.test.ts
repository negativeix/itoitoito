import { describe, expect, it } from 'vitest'
import { judge, placements } from './judge'

describe('judge (rule §1.1.8)', () => {
  it('accepts a fully ascending row', () => {
    expect(judge([3, 17, 42, 88, 100])).toEqual({ wrong: [false, false, false, false, false], wrongCount: 0 })
  })

  it('flags one card out of place in the middle', () => {
    expect(judge([10, 50, 30, 70]).wrong).toEqual([false, false, true, false])
  })

  it('a very high first card makes every lower card after it wrong', () => {
    expect(judge([95, 10, 20, 30])).toEqual({ wrong: [false, true, true, true], wrongCount: 3 })
  })

  it('compares against the highest value so far, not just the previous card', () => {
    // 60 is lower than 80 even though it is higher than 40 right before it.
    expect(judge([20, 80, 40, 60, 90]).wrong).toEqual([false, false, true, true, false])
  })

  it('handles a single card and an empty row', () => {
    expect(judge([1]).wrongCount).toBe(0)
    expect(judge([]).wrongCount).toBe(0)
  })

  it('a fully descending row only keeps the first card right', () => {
    expect(judge([90, 70, 50, 30]).wrongCount).toBe(3)
  })
})

describe('placements', () => {
  it('reports where each value belongs', () => {
    expect(placements([30, 10, 20])).toEqual([
      { value: 30, placed: 1, correct: 3 },
      { value: 10, placed: 2, correct: 1 },
      { value: 20, placed: 3, correct: 2 },
    ])
  })
})
