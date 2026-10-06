import { create } from 'zustand'
import type { ExpressionName } from './expressions'

type JukeState = {
  expression: ExpressionName
  // Bumped to request an immediate blink from outside (e.g. a click reaction).
  blinkRequest: number
  /** 0..1. Sound is on by default at a comfortable level; 0 = muted. */
  volume: number
  setVolume: (v: number) => void
  /** Light expression on top of neutral, e.g. while a DVD is hovered. */
  soft: ExpressionName | null
  setSoft: (e: ExpressionName | null) => void
  setExpression: (e: ExpressionName) => void
  /** Show an expression for `ms`, then return to whatever was set before. */
  flashExpression: (e: ExpressionName, ms: number) => void
  blink: () => void
}

export const DEFAULT_VOLUME = 0.7

/** The visitor's last volume (remembered per browser), or the default. */
function loadVolume() {
  try {
    const v = parseFloat(localStorage.getItem('juke-volume') ?? '')
    if (Number.isFinite(v)) return Math.min(1, Math.max(0, v))
  } catch {
    // ignore
  }
  return DEFAULT_VOLUME
}

let flashTimer: ReturnType<typeof setTimeout> | undefined
let resting: ExpressionName = 'neutral'

export const useJukeStore = create<JukeState>((set, get) => ({
  expression: 'neutral',
  blinkRequest: 0,
  volume: loadVolume(),
  soft: null,
  setSoft: (soft) => set({ soft }),
  setVolume: (v) => {
    const volume = Math.min(1, Math.max(0, v))
    try {
      localStorage.setItem('juke-volume', String(volume))
    } catch {
      // Storage unavailable (private mode): the choice just isn't remembered.
    }
    set({ volume })
  },
  setExpression: (expression) => {
    clearTimeout(flashTimer)
    resting = expression
    set({ expression })
  },
  flashExpression: (expression, ms) => {
    clearTimeout(flashTimer)
    set({ expression })
    flashTimer = setTimeout(() => set({ expression: resting }), ms)
  },
  blink: () => set({ blinkRequest: get().blinkRequest + 1 }),
}))

if (import.meta.env.DEV) (window as unknown as { __juke: typeof useJukeStore }).__juke = useJukeStore
