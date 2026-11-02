import { create } from 'zustand'

type Toast = { id: number; text: string; tone: 'info' | 'error' }

type ToastState = {
  toasts: Toast[]
  show: (text: string, tone?: Toast['tone']) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  show(text, tone = 'info') {
    const id = nextId++
    set({ toasts: [...get().toasts.filter((t) => t.text !== text), { id, text, tone }].slice(-3) })
    setTimeout(() => get().dismiss(id), 3200)
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
}))

export const toast = (text: string, tone?: Toast['tone']) => useToasts.getState().show(text, tone)
