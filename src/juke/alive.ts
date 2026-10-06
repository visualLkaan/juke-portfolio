import * as THREE from 'three'
import { BEHAVIOR, IDLE } from './config'
import type { FaceRig } from './faceRig'
import type { JukeParts, PartName } from './Juke'
import { emitParticle } from './particleQueue'
import type { Pose } from './pose'

const TAU = Math.PI * 2
const beatLen = 60 / IDLE.bpm

/** Sharp attack, quick decay: one "bass thump" per beat. */
const thumpAt = (t: number) => Math.exp(-((t % beatLen) / 0.07))

/**
 * The always-on layer that keeps Juke from ever being still, plus the procedural
 * parts of dancing and sleeping (their weights come from GSAP via `pose.w`).
 * Runs after the parts were reset to rest and before pose offsets are added.
 */
export function applyAlive(P: JukeParts, root: THREE.Object3D, pose: Pose, t: number) {
  const { dance: d, sleep: s, thump } = pose.w

  // Breathing — slower and deeper while asleep.
  const breathRate = THREE.MathUtils.lerp(IDLE.breathRate, IDLE.breathRate * 0.6, s)
  const b = Math.sin(t * TAU * breathRate)
  const breath = b * (1 + s * 0.8)
  P.torso.scale.y *= 1 + IDLE.breathScale * breath
  P.torso.scale.x *= 1 - IDLE.breathScale * 0.3 * breath
  P.head.position.y += IDLE.breathHeadLift * breath

  // Floating hands (no arms, Rayman style), each on its own phase.
  const hf = IDLE.handFloat * (1 - 0.5 * s)
  P.hand_L.position.y += Math.sin(t * 1.7) * hf + IDLE.breathHeadLift * 0.5 * breath
  P.hand_L.position.x += Math.sin(t * 1.1 + 1) * hf * 0.4
  P.hand_L.rotation.z += Math.sin(t * 1.3) * 0.08
  P.hand_R.position.y += Math.sin(t * 1.5 + 2.1) * hf + IDLE.breathHeadLift * 0.5 * breath
  P.hand_R.position.x += Math.sin(t * 0.9 + 3) * hf * 0.4
  P.hand_R.rotation.z += Math.sin(t * 1.2 + 1.4) * 0.08

  // Speakers thump to the music; the caps push out a little more.
  const th = thumpAt(t) * thump * (1 - 0.7 * s)
  for (const sp of ['speaker_L', 'speaker_R'] as const) P[sp].scale.multiplyScalar(1 + IDLE.thumpScale * th)
  P.speaker_L_cap.position.z += IDLE.thumpCap * th
  P.speaker_R_cap.position.z += IDLE.thumpCap * th

  // Handle sways on its hinge.
  P.handle.rotation.x += Math.sin(t * 1.3) * IDLE.handleSway + th * 0.03
  P.handle.rotation.z += Math.sin(t * 0.9 + 0.5) * IDLE.handleSway * 0.6

  // Weight shift: hips sway side to side, legs counter-rotate to stay planted.
  const w = Math.sin(t * TAU * IDLE.weightShiftRate)
  root.position.x += IDLE.weightShift * w
  root.rotation.z += IDLE.weightTilt * w
  P.leg_L.rotation.z -= IDLE.weightTilt * w
  P.leg_R.rotation.z -= IDLE.weightTilt * w
  P.head.rotation.z -= IDLE.weightTilt * 0.6 * Math.sin(t * TAU * IDLE.weightShiftRate - 0.6)

  // Dance: bouncing on the beat, head bob, foot tap, hands keeping time.
  if (d > 0.001) {
    const phase = (t / beatLen) * Math.PI
    const bounce = Math.abs(Math.sin(phase))
    root.position.y += 0.025 * d * bounce
    root.rotation.z += 0.05 * d * Math.sin(phase)
    P.torso.scale.y *= 1 - 0.03 * d * (1 - bounce)
    P.head.rotation.x += 0.12 * d * Math.sin(phase * 2)
    P.head.rotation.z += 0.1 * d * Math.sin(phase)
    P.shoe_R.rotation.x -= 0.35 * d * Math.max(0, Math.sin(phase * 2))
    P.leg_R.rotation.x -= 0.12 * d * Math.max(0, Math.sin(phase * 2))
    P.hand_L.position.y += 0.05 * d * Math.sin(phase * 2 + 1)
    P.hand_L.position.x -= 0.03 * d * bounce
    P.hand_R.position.y += 0.05 * d * Math.sin(phase * 2 + 2.6)
    P.hand_R.position.x += 0.03 * d * bounce
  }

  // Dozing: head droops, hands sag, a slow sway.
  if (s > 0.001) {
    P.head.rotation.x += 0.2 * s
    P.head.position.y -= 0.012 * s
    P.hand_L.position.y -= 0.02 * s
    P.hand_R.position.y -= 0.02 * s
    root.rotation.z += 0.025 * s * Math.sin(t * 0.7)
  }
}

/** Adds the GSAP-driven offsets from `pose` on top of everything else. */
export function applyPose(P: JukeParts, root: THREE.Object3D, pose: Pose, names: readonly PartName[]) {
  const add = (obj: THREE.Object3D, o: Pose['parts'][PartName]) => {
    obj.position.x += o.px
    obj.position.y += o.py
    obj.position.z += o.pz
    obj.rotation.x += o.rx
    obj.rotation.y += o.ry
    obj.rotation.z += o.rz
    if (o.s) obj.scale.multiplyScalar(1 + o.s)
  }
  add(root, pose.parts.root)
  for (const n of names) add(P[n], pose.parts[n])
}

// --- Particles tied to what Juke is doing ---------------------------------------

const tmp = new THREE.Vector3()
const dir = new THREE.Vector3()
const timers = { note: 0, heart: 0, sweat: 0, z: 0, beat: -1 }

export function emitMoodParticles(P: JukeParts, rig: FaceRig, pose: Pose, t: number, dt: number) {
  // Music notes from the speakers on every other beat while dancing.
  const beat = Math.floor(t / beatLen)
  if (pose.w.dance > 0.5 && beat !== timers.beat) {
    timers.beat = beat
    if (beat % 2 === 0) {
      const sp = beat % 4 === 0 ? P.speaker_L : P.speaker_R
      sp.getWorldPosition(tmp)
      dir.set(sp === P.speaker_L ? -0.12 : 0.12, 0.05, 0.05)
      emitParticle('note', tmp.add(dir.clone().multiplyScalar(0.4)), dir)
    }
  }

  const top = () => P.head.localToWorld(tmp.set((Math.random() - 0.5) * 0.4, 0.38, 0.05))

  timers.heart -= dt
  if (rig.expression === 'love' && timers.heart <= 0) {
    timers.heart = BEHAVIOR.heartEvery
    emitParticle('heart', top())
  }

  timers.sweat -= dt
  if (rig.expression === 'shy' && timers.sweat <= 0) {
    timers.sweat = BEHAVIOR.sweatEvery
    emitParticle('sweat', P.head.localToWorld(tmp.set(0.33, 0.3, 0.13)))
  }

  timers.z -= dt
  if (pose.w.sleep > 0.6 && timers.z <= 0) {
    timers.z = BEHAVIOR.zEvery
    emitParticle('z', P.head.localToWorld(tmp.set(0.25, 0.42, 0.05)), dir.set(0.05, 0, 0))
  }
}
