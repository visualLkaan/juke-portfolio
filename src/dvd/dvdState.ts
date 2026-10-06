import type * as THREE from 'three'
import type { DvdHandle } from './DvdCase'
import { create } from 'zustand'
import type { Side } from '../data/projects'

/**
 * Shared DVD state. Per-frame things (which object Juke should look at, where each
 * DVD is) live in plain mutable objects so reading them never re-renders React.
 */
export const dvdFocus = {
  slug: null as string | null,
  object: null as THREE.Object3D | null,
}

/** Every floating DVD, by slug (for Juke's glances and the insert transition). */
export const dvdRegistry = new Map<string, DvdHandle>()

// Mobile rail: horizontal scroll offset and left padding in px, written by the HTML scroller.
export const rail = { scroll: 0, pad: 0 }

type DvdStore = {
  hovered: string | null
  setHovered: (slug: string | null) => void
  /** Which side of the tape is on the shelf. */
  side: Side
  setSide: (side: Side) => void
}

export const useDvdStore = create<DvdStore>((set) => ({
  hovered: null,
  setHovered: (hovered) => set({ hovered }),
  side: 'A',
  setSide: (side) => set({ side }),
}))

if (import.meta.env.DEV) Object.assign(window, { __dvd: useDvdStore, __dvdReg: dvdRegistry })
