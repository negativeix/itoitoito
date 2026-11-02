/**
 * Fractional positions for cards on the table (§4.2): a moved card gets a position strictly
 * between its new neighbours, so only that one row changes and concurrent moves rarely collide.
 */
export function between(prev: number | null | undefined, next: number | null | undefined): number {
  const hasPrev = prev != null
  const hasNext = next != null
  if (!hasPrev && !hasNext) return 1
  if (!hasPrev) return next! - 1
  if (!hasNext) return prev! + 1
  return (prev! + next!) / 2
}

/** Position for inserting at `index` into an already sorted list of other cards' positions. */
export function positionAt(sortedPositions: number[], index: number): number {
  const i = Math.max(0, Math.min(index, sortedPositions.length))
  return between(sortedPositions[i - 1], sortedPositions[i])
}
