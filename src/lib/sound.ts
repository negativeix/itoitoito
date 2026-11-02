import { readLocal, writeLocal } from './storage'

// All sounds are synthesized with Web Audio — no audio files (§2.6).

const MUTE_KEY = 'ito.muted'
let ctx: AudioContext | null = null
let muted = readLocal(MUTE_KEY) === '1'
const listeners = new Set<() => void>()

function audio(): AudioContext | null {
  if (muted) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

// iOS only allows audio after a user gesture: unlock on the first touch.
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio()
    window.removeEventListener('pointerdown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
}

function tone(freq: number, { dur = 0.15, type = 'sine' as OscillatorType, gain = 0.18, slideTo = 0, delay = 0 } = {}) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + delay
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function noise({ dur = 0.12, freq = 2400, gain = 0.25 } = {}) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 0.8
  const g = ac.createGain()
  g.gain.value = gain
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(t)
}

// C major pentatonic, rising one step per correct reveal.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]

export const sound = {
  pop: () => tone(420, { dur: 0.09, slideTo: 180, gain: 0.22 }),
  flip: () => noise({ dur: 0.1, freq: 3000, gain: 0.3 }),
  correct: (step: number) => tone(SCALE[Math.min(step, SCALE.length - 1)], { dur: 0.28, type: 'triangle', gain: 0.16 }),
  wrong: () => {
    tone(140, { dur: 0.35, type: 'sawtooth', gain: 0.08, slideTo: 90 })
    tone(110, { dur: 0.4, type: 'sine', gain: 0.2, slideTo: 70 })
  },
  win: () => [0, 2, 4, 7].forEach((s, i) => tone(SCALE[s], { dur: 0.4, type: 'triangle', gain: 0.15, delay: i * 0.12 })),
  isMuted: () => muted,
  setMuted(value: boolean) {
    muted = value
    writeLocal(MUTE_KEY, value ? '1' : null)
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
