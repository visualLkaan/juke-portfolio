import * as THREE from 'three'

export type ParticleType = 'note' | 'heart' | 'sweat' | 'z'

export type EmitRequest = {
  type: ParticleType
  position: THREE.Vector3
  // Optional push, e.g. notes fly away from the speaker they came from.
  direction?: THREE.Vector3
}

// Emit from anywhere; <Particles> drains the queue each frame.
export const particleQueue: EmitRequest[] = []

export function emitParticle(type: ParticleType, position: THREE.Vector3, direction?: THREE.Vector3) {
  particleQueue.push({ type, position: position.clone(), direction: direction?.clone() })
}
