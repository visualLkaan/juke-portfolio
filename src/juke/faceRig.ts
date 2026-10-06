import * as THREE from 'three'
import { BLINK, FACE, LOOK } from './config'
import { EXPRESSIONS, type EyeParams, type EyeShape, type Expression, type ExpressionName } from './expressions'

type Side = 'L' | 'R'

/** What the eye plates and brows actually draw this frame. */
export type EyeFrame = {
  openness: number // already includes blinks and shape swaps
  squint: number
  pupilX: number
  pupilY: number
  pupilScale: number
  shape: EyeShape
  browAngle: number
  browHeight: number
}

const NUMERIC = ['openness', 'squint', 'pupilX', 'pupilY', 'pupilScale', 'browAngle', 'browHeight'] as const

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt)

/**
 * Mutable, per-frame face state. Expressions only set targets; everything is eased
 * here so transitions are smooth, while blinks stay fast.
 */
export class FaceRig {
  expression: ExpressionName = 'neutral'
  // A toned-down expression layered on neutral (e.g. while a DVD is hovered).
  soft: ExpressionName | null = null
  softWeight = 0.5
  eyes: Record<Side, EyeFrame>
  private base: Record<Side, Omit<EyeParams, 'shape'>>
  private shape: Record<Side, EyeShape> = { L: 'normal', R: 'normal' }
  private swap: Record<Side, number> = { L: -1, R: -1 } // seconds into a shape swap, -1 = none

  blush = 0
  gazeFollow = 1
  cassette = { scale: 1, squash: 1, bounce: 0, bounceSpeed: 6 }
  headPose = { pitch: 0, roll: 0 }

  // Gaze in "pupil space" (-1..1) and the head turn that goes with it.
  gaze = new THREE.Vector2()
  gazeTarget = new THREE.Vector2()
  headLook = new THREE.Vector2() // x = yaw, y = pitch
  // Behaviours can steer the gaze (pupil space) and blend it in with weight 0..1.
  lookOverride = { x: 0, y: 0, weight: 0 }
  private gazeGoal = new THREE.Vector2()

  private blinkT = -1
  private blinkQueue = 0
  private blinkGap = 0
  private nextBlink = rand(BLINK.minInterval, BLINK.maxInterval)
  private lastPointerMove = performance.now() / 1000
  private nextGlance = 0
  private idleTarget = new THREE.Vector2()
  blinkAmount = 0 // 0 open .. 1 closed, for the cassette eyes

  constructor() {
    const n = EXPRESSIONS.neutral
    this.base = { L: { ...n.L }, R: { ...n.R } }
    this.eyes = { L: { ...n.L }, R: { ...n.R } }
  }

  blink(double = false) {
    if (this.blinkT < 0) this.blinkT = 0
    if (double) this.blinkQueue = 1
  }

  pointerMoved(time: number) {
    this.lastPointerMove = time
  }

  /** Cursor position relative to the eyes, in NDC. */
  setCursorOffset(dx: number, dy: number) {
    this.gazeTarget.set(
      THREE.MathUtils.clamp(dx * LOOK.pupilGain, -1, 1),
      THREE.MathUtils.clamp(dy * LOOK.pupilGain, -1, 1),
    )
  }

  idleSeconds(time: number) {
    return time - this.lastPointerMove
  }

  isIdle(time: number) {
    return time - this.lastPointerMove > LOOK.idleAfter
  }

  /** Neutral blended toward `soft`; only gentle eye shapes carry over. */
  private softened(): Expression | null {
    if (!this.soft || this.expression !== 'neutral') return null
    const n = EXPRESSIONS.neutral
    const s = EXPRESSIONS[this.soft]
    const w = this.softWeight
    const mix = (a: number, b: number) => a + (b - a) * w
    const eye = (side: Side): EyeParams => {
      const e = { ...n[side] }
      for (const key of NUMERIC) e[key] = mix(n[side][key], s[side][key])
      e.shape = s[side].shape === 'happyArc' ? 'happyArc' : 'normal'
      return e
    }
    return {
      L: eye('L'),
      R: eye('R'),
      blush: mix(n.blush, Math.max(s.blush, this.soft === 'love' ? 0.8 : 0)),
      gazeFollow: 1,
      cassette: { ...s.cassette, scale: mix(1, s.cassette.scale), bounce: s.cassette.bounce * w },
      head: { pitch: mix(0, s.head.pitch), roll: mix(0, s.head.roll) },
    }
  }

  update(time: number, dt: number) {
    const ex = this.softened() ?? EXPRESSIONS[this.expression]
    const k = damp(FACE.transitionRate, dt)

    // --- Expression targets (eased) ---
    for (const side of ['L', 'R'] as const) {
      const target = ex[side]
      const b = this.base[side]
      for (const key of NUMERIC) b[key] += (target[key] - b[key]) * k

      // Shape swaps hide behind a quick blink: close, switch at the midpoint, reopen.
      if (target.shape !== this.shape[side] && this.swap[side] < 0) this.swap[side] = 0
      if (this.swap[side] >= 0) {
        this.swap[side] += dt
        if (this.swap[side] >= BLINK.shapeSwapDuration / 2) this.shape[side] = target.shape
        if (this.swap[side] >= BLINK.shapeSwapDuration) this.swap[side] = -1
      }
    }
    this.blush += (ex.blush - this.blush) * k
    this.gazeFollow += (ex.gazeFollow - this.gazeFollow) * k
    for (const key of ['scale', 'squash', 'bounce', 'bounceSpeed'] as const)
      this.cassette[key] += (ex.cassette[key] - this.cassette[key]) * k
    this.headPose.pitch += (ex.head.pitch - this.headPose.pitch) * k
    this.headPose.roll += (ex.head.roll - this.headPose.roll) * k

    // --- Idle look-around when the mouse has been still ---
    if (this.isIdle(time)) {
      if (time > this.nextGlance) {
        this.idleTarget.set(rand(-0.8, 0.8), rand(-0.4, 0.5))
        // Sometimes glance back at the viewer.
        if (Math.random() < 0.3) this.idleTarget.set(0, 0)
        this.nextGlance = time + rand(LOOK.idleGlanceMin, LOOK.idleGlanceMax)
      }
      this.gazeTarget.copy(this.idleTarget)
    }
    const o = this.lookOverride
    this.gazeGoal.set(o.x, o.y).sub(this.gazeTarget).multiplyScalar(o.weight).add(this.gazeTarget)
    this.gaze.lerp(this.gazeGoal, damp(LOOK.pupilRate, dt))
    const hk = damp(LOOK.headRate, dt)
    const yaw = THREE.MathUtils.clamp(this.gazeGoal.x * LOOK.headGain, -LOOK.headMaxYaw, LOOK.headMaxYaw)
    const pitch = THREE.MathUtils.clamp(this.gazeGoal.y * LOOK.headGain, -LOOK.headMaxPitch, LOOK.headMaxPitch)
    this.headLook.x += (yaw * Math.max(this.gazeFollow, o.weight) - this.headLook.x) * hk
    this.headLook.y += (pitch * Math.max(this.gazeFollow, o.weight) - this.headLook.y) * hk

    // --- Blinking ---
    this.nextBlink -= dt
    if (this.nextBlink <= 0) {
      this.blink(Math.random() < BLINK.doubleChance)
      this.nextBlink = rand(BLINK.minInterval, BLINK.maxInterval)
    }
    let blink = 0
    if (this.blinkT >= 0) {
      this.blinkT += dt
      const p = this.blinkT / BLINK.duration
      blink = Math.sin(Math.min(p, 1) * Math.PI)
      if (p >= 1) {
        this.blinkT = -1
        if (this.blinkQueue > 0) {
          // A short gap before the second blink of a double.
          this.blinkQueue--
          this.blinkGap = 0.07
        }
      }
    } else if (this.blinkGap > 0) {
      this.blinkGap -= dt
      if (this.blinkGap <= 0) this.blinkT = 0
    }
    this.blinkAmount = blink

    // --- Compose what gets drawn ---
    for (const side of ['L', 'R'] as const) {
      const b = this.base[side]
      const e = this.eyes[side]
      let swapClose = 0
      if (this.swap[side] >= 0) swapClose = Math.sin((this.swap[side] / BLINK.shapeSwapDuration) * Math.PI)
      e.openness = b.openness * (1 - Math.max(blink, swapClose))
      e.squint = b.squint
      e.pupilX = THREE.MathUtils.clamp(b.pupilX * (1 - this.gazeFollow * 0.5) + this.gaze.x * Math.max(this.gazeFollow, o.weight), -1, 1)
      e.pupilY = THREE.MathUtils.clamp(b.pupilY * (1 - this.gazeFollow * 0.5) + this.gaze.y * Math.max(this.gazeFollow, o.weight), -1, 1)
      e.pupilScale = b.pupilScale
      e.shape = this.shape[side]
      e.browAngle = b.browAngle
      e.browHeight = b.browHeight + blink * -0.15 // brows dip a touch with each blink
    }
  }
}
