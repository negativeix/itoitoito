import { readLocal, writeLocal } from './storage'

export type ThemePref = 'auto' | 'light' | 'dark'

const KEY = 'ito.theme'
const listeners = new Set<() => void>()
const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function getThemePref(): ThemePref {
  const v = readLocal(KEY)
  return v === 'light' || v === 'dark' ? v : 'auto'
}

/** Applies a theme override on <html>; "auto" follows the OS setting. */
export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
  writeLocal(KEY, pref === 'auto' ? null : pref)
  // Browser chrome colour follows the app, not just the OS.
  const dark = pref === 'dark' || (pref === 'auto' && !!darkQuery?.matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#17140F' : '#F5EFE4'))
  listeners.forEach((l) => l())
}

/** The theme actually on screen (an "auto" preference resolved against the OS). */
export function isDarkTheme(): boolean {
  const pref = getThemePref()
  return pref === 'dark' || (pref === 'auto' && !!darkQuery?.matches)
}

export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb)
  darkQuery?.addEventListener('change', cb)
  return () => {
    listeners.delete(cb)
    darkQuery?.removeEventListener('change', cb)
  }
}
