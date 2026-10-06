import { create } from 'zustand'

type LoadState = {
  /** 0..1 — the 3D code chunk counts for the first part, assets for the rest. */
  progress: number
  /** The room has rendered its first frame. */
  sceneReady: boolean
  /** The intro (Juke's face waking up) has finished and faded out. */
  introDone: boolean
  set: (s: Partial<Omit<LoadState, 'set'>>) => void
}

export const useLoad = create<LoadState>((set) => ({
  progress: 0,
  sceneReady: false,
  introDone: false,
  set: (s) => set(s),
}))
