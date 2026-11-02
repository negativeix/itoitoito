/**
 * ito rule §1.1.8 — revealing left to right, a card is wrong when it is lower than the highest
 * value revealed before it. Mirrors public._reveal_one in 0003_rpc.sql.
 */
export function judge(valuesInTableOrder: number[]): { wrong: boolean[]; wrongCount: number } {
  let max = 0
  const wrong = valuesInTableOrder.map((v) => {
    const isWrong = v < max
    max = Math.max(max, v)
    return isWrong
  })
  return { wrong, wrongCount: wrong.filter(Boolean).length }
}

/** For the result list: where each card was placed vs. where its value belongs (1-based). */
export function placements(valuesInTableOrder: number[]): { value: number; placed: number; correct: number }[] {
  const sorted = [...valuesInTableOrder].sort((a, b) => a - b)
  return valuesInTableOrder.map((value, i) => ({ value, placed: i + 1, correct: sorted.indexOf(value) + 1 }))
}
