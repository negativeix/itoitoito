import { readLocal, writeLocal } from './storage'

const KEY = 'ito.name'

export const savedName = () => readLocal(KEY) ?? ''
export const saveName = (name: string) => writeLocal(KEY, name.trim() || null)
