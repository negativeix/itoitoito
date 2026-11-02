import { useCallback, useEffect, useState } from 'react'

/**
 * Press-and-hold to peek (§2.7 rule 4): true only while a pointer is held down.
 * Drops back to hidden on release, cancel, leaving, window blur, or the page going hidden.
 */
export function usePressHold() {
  const [held, setHeld] = useState(false)
  const release = useCallback(() => setHeld(false), [])

  useEffect(() => {
    if (!held) return
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') setHeld(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', release)
    window.addEventListener('pagehide', release)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', release)
      window.removeEventListener('pagehide', release)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
  }, [held, release])

  const bind = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      setHeld(true)
    },
    onPointerUp: release,
    onPointerCancel: release,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    // Keyboard parity: hold Space/Enter to peek.
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault()
        setHeld(true)
      }
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') release()
    },
    onBlur: release,
  }

  return { held, bind }
}
