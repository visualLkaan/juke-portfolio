import type { PartName } from './Juke'

/** Additive offsets on top of a part's rest transform. GSAP tweens these numbers. */
export type PartOffset = { px: number; py: number; pz: number; rx: number; ry: number; rz: number; s: number }

export type Pose = {
  parts: Record<PartName | 'root', PartOffset>
  // Blend weights for procedural layers driven in useFrame.
  w: {
    dance: number
    sleep: number
    thump: number // extra speaker thump strength (1 = normal)
  }
}

const zero = (): PartOffset => ({ px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, s: 0 })

export function createPose(names: readonly PartName[]): Pose {
  const parts = { root: zero() } as Pose['parts']
  for (const n of names) parts[n] = zero()
  return { parts, w: { dance: 0, sleep: 0, thump: 1 } }
}
