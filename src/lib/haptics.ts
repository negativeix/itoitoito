// navigator.vibrate works on Android; iOS Safari has no API, so every call fails silently (§2.6).
function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // unsupported
  }
}

export const haptics = {
  tap: () => vibrate(10),
  place: () => vibrate(15),
  wrong: () => vibrate([30, 40, 30]),
  win: () => vibrate([20, 30, 20, 30, 60]),
}
