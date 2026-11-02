import { readLocal, writeLocal } from './storage'

export type ThemePref = 'auto' | 'light' | 'dark'

const KEY = 'ito.theme'

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
}
