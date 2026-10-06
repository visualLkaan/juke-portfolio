import { create } from 'zustand'

/**
 * idle      — home screen, everything clickable
 * inserting — DVD → Juke → cassette → camera push (clicks locked)
 * open      — project page showing
 * ejecting  — the reverse (clicks locked)
 */
export type Phase = 'idle' | 'inserting' | 'open' | 'ejecting'

type TransitionState = {
  phase: Phase
  /** Project whose page is showing (or about to). */
  pageSlug: string | null
  set: (s: Partial<Pick<TransitionState, 'phase' | 'pageSlug'>>) => void
}

export const useTransition = create<TransitionState>((set) => ({
  phase: 'idle',
  pageSlug: null,
  set: (s) => set(s),
}))

export const isLocked = () => useTransition.getState().phase !== 'idle'
