import * as THREE from 'three'
import gsap from 'gsap'
import { INTERACT } from './config'
import type { BehaviorCtx, BehaviorDirector } from './behaviors'
import type { ExpressionName } from './expressions'
import type { PartName } from './Juke'
import { emitParticle } from './particleQueue'
import { playSound } from './sound'
import { useJukeStore } from './useJukeStore'

/** Click targets: every mesh maps to one of these. */
export type Hotspot = 'button_1' | 'button_2' | 'button_3' | 'button_4' | 'speaker_L' | 'speaker_R' | 'head' | 'handle' | 'hand_L' | 'hand_R' | 'body'

const HOTSPOT: Partial<Record<PartName, Hotspot>> = {
  button_1: 'button_1',
  button_2: 'button_2',
  button_3: 'button_3',
  button_4: 'button_4',
  speaker_L: 'speaker_L',
  speaker_L_cap: 'speaker_L',
  speaker_R: 'speaker_R',
  speaker_R_cap: 'speaker_R',
  head: 'head',
  cassette_door: 'head',
  cassette_eye_L: 'head',
  cassette_eye_R: 'head',
  handle: 'handle',
  handle_grip: 'handle',
  hand_L: 'hand_L',
  hand_R: 'hand_R',
  torso: 'body',
  leg_L: 'body',
  leg_R: 'body',
  shoe_L: 'body',
  shoe_R: 'body',
  shoe_L_tip: 'body',
  shoe_R_tip: 'body',
}

/** Walk up from the clicked object (eye plate, outline, brow…) to a named part. */
export function hotspotOf(obj: THREE.Object3D | null): Hotspot | null {
  for (let o = obj; o; o = o.parent) {
    const h = HOTSPOT[o.name as PartName]
    if (h) return h
  }
  return null
}

const expr = (e: ExpressionName) => useJukeStore.getState().setExpression(e)
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]
const tmp = new THREE.Vector3()

function burst(c: BehaviorCtx, type: 'note' | 'heart', count: number, tl: gsap.core.Timeline, at: number) {
  for (let i = 0; i < count; i++) {
    tl.call(
      () => {
        const sp = i % 2 ? c.parts.speaker_R : c.parts.speaker_L
        sp.getWorldPosition(tmp)
        const dir = new THREE.Vector3(sp === c.parts.speaker_L ? -0.15 : 0.15, 0.1, 0.06)
        emitParticle(type, tmp, dir)
      },
      [],
      at + i * 0.09,
    )
  }
}

function pressButton(c: BehaviorCtx, tl: gsap.core.Timeline, n: number) {
  const btn = c.pose.parts[`button_${n}` as PartName]
  tl.call(() => playSound('click'), [], 0)
    .to(btn, { py: -0.016, duration: 0.06, ease: 'power2.in' }, 0)
    .to(btn, { py: 0, duration: 0.7, ease: 'elastic.out(1.3, 0.28)' }, 0.1)
}

const REACTIONS: Record<Hotspot, (c: BehaviorCtx) => gsap.core.Timeline> = {
  // 1 → a random happy face + music notes
  button_1: (c) => {
    const tl = gsap.timeline()
    pressButton(c, tl, 1)
    tl.call(() => expr(pick(['happy', 'excited', 'wink', 'proud'] as const)), [], 0.08)
      .call(() => playSound('notes'), [], 0.1)
    burst(c, 'note', 8, tl, 0.1)
    tl.call(() => expr('neutral'), [], 2.4)
    return tl
  },
  // 2 → a short dance
  button_2: (c) => {
    const tl = gsap.timeline()
    pressButton(c, tl, 2)
    tl.call(() => expr('happy'), [], 0.08)
      .to(c.pose.w, { dance: 1, thump: 1.8, duration: 0.3 }, 0.1)
      .call(() => expr('excited'), [], 1.4)
      .to(c.pose.w, { dance: 0, thump: 1, duration: 0.4 }, 2.6)
      .call(() => expr('neutral'), [], 3)
    return tl
  },
  // 3 → dizzy: spiral eyes and a full head spin
  button_3: (c) => {
    const head = c.pose.parts.head
    const tl = gsap.timeline()
    pressButton(c, tl, 3)
    tl.call(() => expr('dizzy'), [], 0.08)
      .call(() => playSound('dizzy'), [], 0.1)
      .to(head, { ry: Math.PI * 2, duration: 0.9, ease: 'power2.inOut' }, 0.1)
      .set(head, { ry: 0 })
      .to(head, { rz: 0.12, duration: 0.35, repeat: 3, yoyo: true, ease: 'sine.inOut' })
      .to(head, { rz: 0, duration: 0.3 })
      .call(() => expr('neutral'), [], '+=0.5')
    return tl
  },
  // 4 → love + hearts
  button_4: (c) => {
    const tl = gsap.timeline()
    pressButton(c, tl, 4)
    tl.call(() => expr('love'), [], 0.08).call(() => playSound('love'), [], 0.1)
    burst(c, 'heart', 7, tl, 0.15)
    tl.to(c.pose.parts.head, { rz: 0.08, duration: 0.5, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.1)
      .call(() => expr('neutral'), [], 3)
    return tl
  },
  // "Hey!" — blink, surprised, then happy.
  speaker_L: (c) => speakerPoke(c, 'speaker_L'),
  speaker_R: (c) => speakerPoke(c, 'speaker_R'),
  // Head wobbles, brows shoot up.
  head: (c) => {
    const head = c.pose.parts.head
    const tl = gsap.timeline()
    tl.call(() => playSound('bonk'), [], 0)
      .call(() => expr('surprised'), [], 0)
      .fromTo(head, { rz: 0.28, rx: -0.1 }, { rz: 0, rx: 0, duration: 1.3, ease: 'elastic.out(1.2, 0.2)' }, 0)
      .fromTo(c.pose.parts.root, { py: -0.02 }, { py: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }, 0)
      .call(() => expr('neutral'), [], 1.4)
    return tl
  },
  handle: (c) => {
    const tl = gsap.timeline()
    tl.call(() => playSound('boing'), [], 0)
      .fromTo(c.pose.parts.handle, { rx: -0.8 }, { rx: 0, duration: 1.8, ease: 'elastic.out(1.1, 0.16)' }, 0)
      .fromTo(c.pose.parts.handle_grip, { s: 0.18 }, { s: 0, duration: 1.2, ease: 'elastic.out(1, 0.3)' }, 0)
      .call(() => expr('surprised'), [], 0.02)
      .call(() => expr('happy'), [], 0.6)
      .call(() => expr('neutral'), [], 1.8)
    return tl
  },
  hand_L: (c) => highFive(c, 'hand_L'),
  hand_R: (c) => highFive(c, 'hand_R'),
  // Tickle!
  body: (c) => {
    const tl = gsap.timeline()
    tl.call(() => expr('happy'), [], 0)
      .call(() => playSound('giggle'), [], 0)
      .to(c.pose.parts.root, { rz: 0.06, duration: 0.07, repeat: 7, yoyo: true, ease: 'sine.inOut' }, 0)
      .to(c.pose.parts.torso, { s: 0.04, duration: 0.07, repeat: 7, yoyo: true }, 0)
      .to(c.pose.parts.root, { rz: 0, duration: 0.1 })
      .call(() => expr('neutral'), [], 1.5)
    return tl
  },
}

function speakerPoke(c: BehaviorCtx, name: 'speaker_L' | 'speaker_R') {
  const sp = c.pose.parts[name]
  const tl = gsap.timeline()
  tl.call(() => c.rig.blink(), [], 0)
    .call(() => playSound('hey'), [], 0)
    .call(() => expr('surprised'), [], 0.05)
    .fromTo(sp, { s: -0.18 }, { s: 0, duration: 0.8, ease: 'elastic.out(1.2, 0.3)' }, 0)
    .to(c.pose.parts.head, { rz: name === 'speaker_L' ? -0.08 : 0.08, duration: 0.15 }, 0)
    .to(c.pose.parts.head, { rz: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' }, 0.2)
    .call(() => expr('happy'), [], 0.55)
    .call(() => expr('neutral'), [], 1.9)
  return tl
}

function highFive(c: BehaviorCtx, name: 'hand_L' | 'hand_R') {
  const side = name === 'hand_L' ? -1 : 1
  const hand = c.pose.parts[name]
  const tl = gsap.timeline()
  tl.call(() => expr('excited'), [], 0)
    .to(c.rig.lookOverride, { weight: 1, x: 0, y: 0, duration: 0.2 }, 0)
    // Raise the palm towards the viewer...
    .to(hand, { px: side * 0.25, py: 0.4, pz: 0.12, rx: -0.4, rz: -side * 0.3, duration: 0.35, ease: 'back.out(1.7)' }, 0)
    // ...slap!
    .to(hand, { pz: 0.3, duration: 0.08, ease: 'power3.in' }, 0.5)
    .call(() => playSound('clap'), [], 0.58)
    .to(hand, { pz: 0.12, duration: 0.25, ease: 'back.out(2)' }, 0.58)
    .to(c.pose.parts.root, { py: 0.04, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' }, 0.6)
    .call(() => expr('happy'), [], 0.7)
    .to(hand, { px: 0, py: 0, pz: 0, rx: 0, rz: 0, duration: 0.5, ease: 'power2.inOut' }, 1.2)
    .to(c.rig.lookOverride, { weight: 0, duration: 0.4 }, 1.2)
    .call(() => expr('neutral'), [], 1.9)
  return tl
}

/** Easter egg: too many clicks make Juke dizzy, then grumpy, then he forgives you. */
function annoyed(c: BehaviorCtx) {
  const head = c.pose.parts.head
  const tl = gsap.timeline()
  tl.call(() => expr('dizzy'), [], 0)
    .call(() => playSound('dizzy'), [], 0)
    .to(head, { ry: Math.PI * 4, duration: 1.1, ease: 'power2.inOut' }, 0)
    .set(head, { ry: 0 })
    .to(c.pose.parts.root, { rz: 0.08, duration: 0.3, repeat: 3, yoyo: true, ease: 'sine.inOut' }, 1.1)
    .to(c.pose.parts.root, { rz: 0, duration: 0.2 })
    // Grumpy: angry brows, head shake, hands on hips.
    .call(() => expr('angry'), [], 2.2)
    .call(() => playSound('grumble'), [], 2.2)
    .to(c.rig.lookOverride, { weight: 1, x: 0, y: 0, duration: 0.2 }, 2.2)
    .to(c.pose.parts.hand_L, { px: -0.04, py: 0.08, pz: 0.04, duration: 0.3 }, 2.2)
    .to(c.pose.parts.hand_R, { px: 0.04, py: 0.08, pz: 0.04, duration: 0.3 }, 2.2)
    .to(head, { ry: 0.22, duration: 0.14, repeat: 5, yoyo: true, ease: 'sine.inOut' }, 2.5)
    .to(head, { ry: 0, duration: 0.15 })
    .call(() => expr('sad'), [], 4.1)
    // ...okay, forgiven.
    .call(() => expr('happy'), [], 5.2)
    .call(() => playSound('love'), [], 5.2)
    .call(() => {
      c.parts.head.localToWorld(tmp.set(0, 0.4, 0.1))
      emitParticle('heart', tmp)
    }, [], 5.3)
    .to([c.pose.parts.hand_L, c.pose.parts.hand_R], { px: 0, py: 0, pz: 0, duration: 0.5 }, 5.2)
    .to(c.rig.lookOverride, { weight: 0, duration: 0.5 }, 5.6)
    .call(() => expr('neutral'), [], 6.6)
  return tl
}

const clickTimes: number[] = []

export function handleClick(director: BehaviorDirector, hotspot: Hotspot) {
  const now = performance.now() / 1000
  clickTimes.push(now)
  while (clickTimes.length && now - clickTimes[0] > INTERACT.rapidWindow) clickTimes.shift()
  if (clickTimes.length >= INTERACT.rapidClicks) {
    clickTimes.length = 0
    director.react(annoyed)
    return
  }
  director.react(REACTIONS[hotspot])
}
