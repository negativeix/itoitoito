/**
 * Builds a looping "coiled thread" SVG path (a prolate trochoid with straight tails),
 * fitted inside a width × height box. Used on card backs and under the logo.
 */
export function coilPath({
  width,
  height,
  loops = 3,
  tail = 0.12,
  steps = 48,
}: {
  width: number
  height: number
  loops?: number
  tail?: number
  steps?: number
}): string {
  // x = a·t − b·sin t, y = b·cos t   (b > a ⇒ loops)
  const a = 1
  const b = 2.4
  const tMax = loops * 2 * Math.PI
  const rawW = a * tMax + 2 * b
  const tailW = width * tail
  const sx = (width - 2 * tailW) / rawW
  const sy = (height * 0.9) / (2 * b)
  const sc = Math.min(sx, sy)
  const offX = tailW + (width - 2 * tailW - rawW * sc) / 2 + b * sc
  const midY = height / 2

  const pts: string[] = []
  const total = loops * steps
  for (let i = 0; i <= total; i++) {
    const t = (i / total) * tMax
    const x = offX + (a * t - b * Math.sin(t)) * sc
    // At t = 0 and t = tMax the curve sits at the bottom of a loop, where the tails attach.
    const y = midY + b * Math.cos(t) * sc
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  const startY = pts[0].split(' ')[1]
  const endY = pts[pts.length - 1].split(' ')[1]
  return `M0 ${startY} L${pts.join(' L')} L${width} ${endY}`
}
