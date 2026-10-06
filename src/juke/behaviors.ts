import * as THREE from 'three'
import gsap from 'gsap'
import { BEHAVIOR, LOOK } from './config'
import type { ExpressionName } from './expressions'
import type { FaceRig } from './faceRig'
import type { JukeParts, PartName } from './Juke'
import type { Pose } from './pose'
import { useJukeStore } from './useJukeStore'
import { dvdRegistry } from '../dvd/dvdState'

export type BehaviorCtx = {
  pose: Pose
  rig: FaceRig
  parts: JukeParts
  root: THREE.Object3D
  camera: THREE.Camera
  rest: (name: PartName) => THREE.Vector3
}

export const BEHAVIOR_NAMES = ['dance', 'lookAround', 'yawn', 'pressButton', 'handleBoing', 'wave', 'lookAtDvd'] as const
export type BehaviorName = (typeof BEHAVIOR_NAMES)[number]

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]
const expr = (e: ExpressionName) => useJukeStore.getState().setExpression(e)
const OFFSET_KEYS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 's'] as const

/**
 * Picks a random behaviour every 8–20 s (never the same twice in a row), dozes off
 * after a minute without interaction and wakes up startled when the mouse moves.
 */
export class BehaviorDirector {
  private tl: gsap.core.Timeline | null = null
  private last: BehaviorName | null = null
  private nextAt: number
  sleeping = false
  private wokeAt = -Infinity
  enabled = true

  constructor(private ctx: () => BehaviorCtx | null) {
    this.nextAt = performance.now() / 1000 + rand(BEHAVIOR.minGap, BEHAVIOR.minGap + 4)
  }

  get busy() {
    return !!this.tl
  }

  update(now: number) {
    const c = this.ctx()
    if (!c || !this.enabled || this.sleeping) return
    if (!this.busy && c.rig.idleSeconds(now) > BEHAVIOR.sleepAfter) {
      this.fallAsleep()
      return
    }
    if (!this.busy && now >= this.nextAt) {
      const options = BEHAVIOR_NAMES.filter((b) => b !== this.last)
      this.play(pick(options))
    }
  }

  /** Any pointer activity. */
  onActivity() {
    if (this.sleeping) this.wake()
  }

  /**
   * Play a reaction to the user (clicks etc). Returns false when the click only
   * woke Juke up, so the same click doesn't also trigger a reaction.
   */
  react(build: (c: BehaviorCtx) => gsap.core.Timeline) {
    const c = this.ctx()
    if (!c) return false
    if (performance.now() / 1000 - this.wokeAt < 0.6) return false
    this.interrupt(false)
    this.run(build(c))
    return true
  }

  play(name: BehaviorName) {
    const c = this.ctx()
    if (!c) return
    this.interrupt(false)
    this.last = name
    const tl = BUILDERS[name](c)
    this.run(tl)
  }

  /** Stop whatever is playing and ease the body back to rest. */
  interrupt(schedule = true) {
    const c = this.ctx()
    this.tl?.kill()
    this.tl = null
    if (c) {
      resetPose(c.pose, 0.35)
      gsap.to(c.rig.lookOverride, { weight: 0, duration: 0.35, overwrite: true })
    }
    if (schedule) this.scheduleNext()
  }

  /** Hello after the intro: a big stretch, then a wave. */
  greet() {
    const c = this.ctx()
    if (!c) return
    this.interrupt(false)
    this.last = 'wave'
    const tl = gsap.timeline()
    tl.add(BUILDERS.yawn(c, true)).call(() => expr('happy')).add(BUILDERS.wave(c))
    this.run(tl)
  }

  /** A contact DVD was clicked: Juke waves it off with that DVD's expression. */
  waveBye(expression: ExpressionName) {
    this.react((c) => gsap.timeline().call(() => expr(expression)).add(BUILDERS.wave(c), 0.05).call(() => expr(expression), [], 0.1))
  }

  /** The shelf flips to the other side of the tape: Juke pops his cassette door. */
  flipTape() {
    const c = this.ctx()
    if (!c) return
    if (this.sleeping) this.wake()
    this.interrupt(false)
    const P = c.pose.parts
    const tl = gsap.timeline()
    tl.call(() => expr('surprised'))
      .to(P.cassette_door, { rx: 1.1, duration: 0.25, ease: 'back.out(2.2)' }, 0)
      .to(P.head, { ry: 0.32, duration: 0.3, ease: 'power2.out' }, 0)
      .to(P.cassette_door, { rx: 0, duration: 0.18, ease: 'power3.in' }, 0.55)
      .call(() => expr('excited'), [], 0.72)
      .fromTo([P.speaker_L, P.speaker_R], { s: 0.22 }, { s: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)', immediateRender: false }, 0.73)
      .to(P.head, { ry: 0, duration: 0.5, ease: 'sine.inOut' }, 1)
      .call(() => expr('neutral'), [], 2.2)
    this.run(tl)
  }

  fallAsleep() {
    const c = this.ctx()
    if (!c) return
    this.interrupt(false)
    this.sleeping = true
    const tl = BUILDERS.yawn(c, true)
    tl.call(() => expr('asleep'))
    tl.to(c.pose.w, { sleep: 1, duration: 1.6, ease: 'sine.inOut' })
    // Stays asleep (timeline just ends; `sleeping` keeps the director quiet).
    this.tl = tl
    tl.eventCallback('onComplete', () => (this.tl = null))
  }

  wake() {
    const c = this.ctx()
    if (!c) return
    this.tl?.kill()
    this.tl = null
    this.sleeping = false
    this.wokeAt = performance.now() / 1000
    resetPose(c.pose, 0.2)
    gsap.to(c.pose.w, { sleep: 0, duration: 0.25, overwrite: true })
    useJukeStore.getState().setExpression('neutral')
    useJukeStore.getState().flashExpression('surprised', 900)
    // Startled hop.
    const root = c.pose.parts.root
    const tl = gsap.timeline()
    tl.to(root, { py: 0.07, duration: 0.14, ease: 'power2.out' })
      .to(root, { py: 0, duration: 0.22, ease: 'bounce.out' })
      .fromTo(c.pose.parts.handle, { rx: 0.6 }, { rx: 0, duration: 1.2, ease: 'elastic.out(1, 0.25)' }, '<')
    this.run(tl)
  }

  private run(tl: gsap.core.Timeline) {
    this.tl = tl
    tl.eventCallback('onComplete', () => {
      if (this.tl === tl) {
        this.tl = null
        this.scheduleNext()
      }
    })
  }

  private scheduleNext() {
    this.nextAt = performance.now() / 1000 + rand(BEHAVIOR.minGap, BEHAVIOR.maxGap)
  }
}

function resetPose(pose: Pose, duration: number) {
  for (const o of Object.values(pose.parts)) {
    if (OFFSET_KEYS.some((k) => o[k] !== 0)) gsap.to(o, { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, s: 0, duration, overwrite: true })
  }
  gsap.to(pose.w, { dance: 0, thump: 1, duration, overwrite: true })
}

/** Gaze (pupil space) that points at a world position. */
export function gazeAt(c: BehaviorCtx, world: THREE.Vector3) {
  const face = c.parts.cassette_door.getWorldPosition(new THREE.Vector3()).project(c.camera)
  const p = world.clone().project(c.camera)
  return {
    x: THREE.MathUtils.clamp((p.x - face.x) * LOOK.pupilGain, -1, 1),
    y: THREE.MathUtils.clamp((p.y - face.y) * LOOK.pupilGain, -1, 1),
  }
}

/** Offset that moves `part` (a child of root) to a point given in root space. */
function offsetTo(c: BehaviorCtx, part: PartName, target: THREE.Vector3) {
  return target.clone().sub(c.rest(part))
}

// Hands rest beside the hips; anything near the head must go around the (wide) box.
const SIDE_UP = { px: 0.27, py: 0.45 }

const BUILDERS: Record<BehaviorName, (c: BehaviorCtx, quiet?: boolean) => gsap.core.Timeline> = {
  dance: (c) => {
    const tl = gsap.timeline()
    tl.call(() => expr('happy'))
      .to(c.pose.w, { dance: 1, thump: 1.8, duration: 0.5, ease: 'sine.out' })
      .call(() => expr('excited'), [], '+=2.6')
      .call(() => expr('happy'), [], '+=1.6')
      .to(c.pose.w, { dance: 0, thump: 1, duration: 0.6, ease: 'sine.in' }, '+=1.4')
      .call(() => expr('neutral'))
    return tl
  },

  lookAround: (c) => {
    const o = c.rig.lookOverride
    const tl = gsap.timeline()
    tl.call(() => expr('suspicious'))
      .to(o, { weight: 1, x: -0.95, y: 0.05, duration: 0.45, ease: 'power2.out' })
      .to(o, { x: 0.95, y: 0.12, duration: 0.55, ease: 'power2.inOut' }, '+=1')
      .to(o, { x: 0.1, y: -0.1, duration: 0.35, ease: 'power2.inOut' }, '+=0.9')
      .call(() => expr('neutral'))
      .to(o, { weight: 0, duration: 0.5 }, '+=0.3')
    return tl
  },

  yawn: (c, quiet = false) => {
    const L = c.pose.parts.hand_L
    const R = c.pose.parts.hand_R
    const tl = gsap.timeline()
    tl.call(() => expr('yawn'))
      .to(L, { px: -SIDE_UP.px, py: SIDE_UP.py, rz: 0.7, duration: 0.8, ease: 'power2.inOut' })
      .to(R, { px: SIDE_UP.px, py: SIDE_UP.py, rz: -0.7, duration: 0.8, ease: 'power2.inOut' }, '<')
      .to(c.pose.parts.torso, { s: 0.04, duration: 0.8, ease: 'power2.inOut' }, '<')
      // Little stretch shiver at the top.
      .to([L, R], { py: '+=0.015', duration: 0.08, repeat: 5, yoyo: true, ease: 'sine.inOut' })
      .to([L, R], { px: 0, py: 0, rz: 0, duration: 0.7, ease: 'power2.inOut' }, '+=0.3')
      .to(c.pose.parts.torso, { s: 0, duration: 0.7, ease: 'power2.inOut' }, '<')
    if (!quiet) tl.call(() => expr('sleepy')).call(() => expr('neutral'), [], '+=3')
    else tl.call(() => expr('sleepy'))
    return tl
  },

  pressButton: (c) => {
    const n = 1 + Math.floor(Math.random() * 4)
    const button = `button_${n}` as PartName
    const handName: PartName = n <= 2 ? 'hand_L' : 'hand_R'
    const side = n <= 2 ? -1 : 1
    const hand = c.pose.parts[handName]
    const btn = c.pose.parts[button]

    // Button top, in root space.
    const target = c.root.worldToLocal(c.parts[button].getWorldPosition(new THREE.Vector3()))
    target.y += 0.095
    target.z += 0.01
    const off = offsetTo(c, handName, target)

    const tl = gsap.timeline()
    tl.call(() => expr('focused'))
      .to(c.rig.lookOverride, { weight: 1, x: 0, y: 1, duration: 0.4 }, 0)
      .to(hand, { px: side * SIDE_UP.px, py: SIDE_UP.py, duration: 0.45, ease: 'power2.inOut' }, 0)
      .to(hand, { py: off.y + 0.1, duration: 0.3, ease: 'power2.out' })
      .to(hand, { px: off.x, pz: off.z, duration: 0.35, ease: 'power2.inOut' })
      .to(hand, { py: off.y, duration: 0.25, ease: 'power2.inOut' })
      // Press!
      .to(hand, { py: off.y - 0.015, duration: 0.07, ease: 'power2.in' })
      .to(btn, { py: -0.015, duration: 0.07, ease: 'power2.in' }, '<')
      .call(() => expr(pick(['happy', 'excited', 'surprised', 'love', 'proud', 'wink'] as const)))
      .to(c.rig.lookOverride, { weight: 0, duration: 0.4 }, '<')
      .to(btn, { py: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.3)' }, '+=0.08')
      .to(hand, { py: off.y + 0.1, duration: 0.25, ease: 'power2.out' }, '<')
      .to(hand, { px: side * SIDE_UP.px, pz: 0, duration: 0.35, ease: 'power2.inOut' })
      .to(hand, { px: 0, py: 0, duration: 0.5, ease: 'power2.inOut' })
      .call(() => expr('neutral'), [], '+=1.4')
    return tl
  },

  handleBoing: (c) => {
    const root = c.pose.parts.root
    const tl = gsap.timeline()
    tl.to(root, { py: 0.05, duration: 0.18, ease: 'power2.out' })
      .to(root, { py: 0, duration: 0.16, ease: 'power2.in' })
      .call(() => expr('surprised'))
      .fromTo(c.pose.parts.handle, { rx: 0.75 }, { rx: 0, duration: 1.8, ease: 'elastic.out(1.1, 0.18)' })
      .fromTo(c.pose.parts.handle_grip, { s: 0.15 }, { s: 0, duration: 1.2, ease: 'elastic.out(1, 0.3)' }, '<')
      .to(c.pose.parts.torso, { s: -0.03, duration: 0.08, yoyo: true, repeat: 1 }, '<')
      .call(() => expr('happy'), [], '<0.5')
      .call(() => expr('neutral'), [], '+=0.8')
    return tl
  },

  wave: (c) => {
    const R = c.pose.parts.hand_R
    const o = c.rig.lookOverride
    const tl = gsap.timeline()
    tl.call(() => expr('happy'))
      .to(o, { weight: 1, x: 0, y: 0, duration: 0.3 }, 0)
      .to(R, { px: SIDE_UP.px, py: SIDE_UP.py + 0.04, pz: 0.08, rz: 0.3, duration: 0.45, ease: 'back.out(1.6)' }, 0)
      .to(c.pose.parts.head, { rz: -0.06, duration: 0.4 }, 0)
      .to(R, { rz: -0.5, duration: 0.18, repeat: 5, yoyo: true, ease: 'sine.inOut' })
      .to(R, { px: 0, py: 0, pz: 0, rz: 0, duration: 0.55, ease: 'power2.inOut' })
      .to(c.pose.parts.head, { rz: 0, duration: 0.4 }, '<')
      .to(o, { weight: 0, duration: 0.4 }, '<')
      .call(() => expr('neutral'), [], '+=0.6')
    return tl
  },

  lookAtDvd: (c) => {
    // A random floating DVD (falls back to the shelf area if there are none yet).
    // Only DVDs on the side of the tape that's showing.
    const dvds = [...dvdRegistry.values()].filter((d) => d.root.getWorldScale(new THREE.Vector3()).x > 0.01)
    const spot = dvds.length ? pick(dvds).root.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(...BEHAVIOR.dvdSpot)
    const g = gazeAt(c, spot)
    const o = c.rig.lookOverride
    const tl = gsap.timeline()
    tl.to(o, { weight: 1, x: g.x, y: g.y, duration: 0.5, ease: 'power2.out' })
      .call(() => expr('thinking'), [], '<0.2')
      .to(c.pose.parts.head, { rz: 0.07, duration: 0.6, ease: 'sine.inOut' }, '+=0.8')
      .to(c.pose.parts.head, { rz: 0, duration: 0.5, ease: 'sine.inOut' }, '+=0.9')
      .call(() => expr('neutral'))
      .to(o, { weight: 0, duration: 0.5 })
    return tl
  },
}

