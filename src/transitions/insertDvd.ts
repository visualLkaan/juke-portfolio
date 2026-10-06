import * as THREE from 'three'
import gsap from 'gsap'
import type { Project } from '../data/projects'
import { dvdRegistry } from '../dvd/dvdState'
import type { DvdHandle } from '../dvd/DvdCase'
import { playDvdEject, playDvdSelect } from '../dvd/dvdSounds'
import { TRANSITION } from '../juke/config'
import { gazeAt, type BehaviorCtx } from '../juke/behaviors'
import type { ExpressionName } from '../juke/expressions'
import { SLOT, jukeApi } from '../juke/jukeApi'
import { emitParticle } from '../juke/particleQueue'
import { useJukeStore } from '../juke/useJukeStore'
import { isLocked, useTransition } from './transitionStore'
import { flashElement } from './flash'

/*
 * The key moment: click a DVD → Juke catches it, opens his cassette door, the disc
 * spins into the slot, the door shuts with a bass thump and the camera pushes into
 * the cassette window → flash → project page. `ejectDvd` plays it all backwards.
 */

type Navigate = (to: string) => void

// Juke's right hand reaching up to catch (pose offsets, Juke units).
const CATCH = { px: 0.2, py: 0.42, pz: 0.18, rz: 0.25 }
// Where the case sits relative to that hand.
const HOLD_POS = new THREE.Vector3(0.07, 0.12, 0.05)
const HOLD_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.15, 0.12))
const HOLD_OPEN = 0.5 // lid swung to ~90°, clear of Juke's face
// Disc path in head space: in front of the slot (a bit high, over the open door), then inside.
const DISC_FRONT = new THREE.Vector3(SLOT.center[0], 0.215, 0.26)
const DISC_INSIDE = new THREE.Vector3(SLOT.center[0], 0.16, 0.085)
const DISC_TILT = -1.15 // turns edge-on as it slides in

type Saved = {
  slug: string
  index: number
  caseParent: THREE.Object3D
  discParent: THREE.Object3D
  cam: { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number }
}
let saved: Saved | null = null
let current: gsap.core.Timeline | null = null


const expr = (e: ExpressionName) => useJukeStore.getState().setExpression(e)
const v3 = () => new THREE.Vector3()
const q4 = () => new THREE.Quaternion()
const Z = new THREE.Vector3(0, 0, 1)
const X = new THREE.Vector3(1, 0, 0)

function sceneOf(o: THREE.Object3D) {
  let s = o
  while (s.parent) s = s.parent
  return s
}

function bezier(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number, out = v3()) {
  const u = 1 - t
  return out.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(c, 2 * u * t).addScaledVector(b, t * t)
}

function setFlash(color: string) {
  const flashEl = flashElement()
  if (!flashEl) return
  flashEl.style.background = `radial-gradient(circle at 50% 50%, #ffffff 0%, #fff8e6 22%, ${color} 70%, ${color} 100%)`
}

/** Camera pose that fills the screen with the cassette window. */
function pushedCamera(c: BehaviorCtx) {
  const cam = c.camera as THREE.PerspectiveCamera
  const head = c.parts.head
  head.updateWorldMatrix(true, false)
  const center = head.localToWorld(new THREE.Vector3(SLOT.center[0], SLOT.center[1], SLOT.windowFrontZ))
  const quat = head.getWorldQuaternion(q4())
  const fwd = Z.clone().applyQuaternion(quat)
  const windowW = SLOT.windowWidth * head.getWorldScale(v3()).x
  const halfTan = Math.tan(THREE.MathUtils.degToRad(TRANSITION.cameraFov / 2)) / cam.zoom
  const d = windowW / TRANSITION.fillWindow / (2 * halfTan * cam.aspect)
  return { pos: center.addScaledVector(fwd, d), quat, fov: TRANSITION.cameraFov }
}

function tweenCamera(tl: gsap.core.Timeline, c: BehaviorCtx, to: () => { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number }, at: number, duration: number) {
  const cam = c.camera as THREE.PerspectiveCamera
  const p = { t: 0 }
  let from: { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number }
  let target: ReturnType<typeof to>
  tl.call(() => {
    from = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov }
    target = to()
    p.t = 0
  }, [], at)
  tl.to(p, {
    t: 1,
    duration,
    ease: 'power3.inOut',
    onUpdate: () => {
      cam.position.lerpVectors(from.pos, target.pos, p.t)
      cam.quaternion.slerpQuaternions(from.quat, target.quat, p.t)
      cam.fov = THREE.MathUtils.lerp(from.fov, target.fov, p.t)
      cam.updateProjectionMatrix()
    },
  }, at)
}

/** Get Juke out of whatever he's doing and keep random behaviours off. */
function takeOverJuke() {
  const d = jukeApi.director
  if (!d) return
  if (d.sleeping) d.wake()
  d.interrupt(false)
  d.enabled = false
}

function releaseJuke() {
  const d = jukeApi.director
  if (d) {
    d.enabled = true
    d.interrupt(true)
  }
}

function thump(tl: gsap.core.Timeline, c: BehaviorCtx, at: number) {
  const P = c.pose.parts
  tl.fromTo([P.speaker_L, P.speaker_R], { s: 0.34 }, { s: 0, duration: 0.9, ease: 'elastic.out(1, 0.28)', immediateRender: false }, at)
  tl.fromTo([P.speaker_L_cap, P.speaker_R_cap], { pz: 0.035 }, { pz: 0, duration: 0.7, ease: 'elastic.out(1, 0.3)', immediateRender: false }, at)
  tl.fromTo(P.root, { py: -0.025 }, { py: 0, duration: 0.6, ease: 'elastic.out(1, 0.35)', immediateRender: false }, at)
  tl.fromTo(P.handle, { rx: 0.55 }, { rx: 0, duration: 1.1, ease: 'elastic.out(1, 0.25)', immediateRender: false }, at)
  tl.call(() => {
    expr('excited')
    const tmp = v3()
    for (let i = 0; i < 4; i++) {
      const sp = i % 2 ? c.parts.speaker_R : c.parts.speaker_L
      sp.getWorldPosition(tmp)
      emitParticle('note', tmp, new THREE.Vector3(sp === c.parts.speaker_L ? -0.16 : 0.16, 0.08 + i * 0.03, 0.06))
    }
  }, [], at)
}

/** Disc spinning between two head-space poses (position, tilt, scale). */
function discMove(
  tl: gsap.core.Timeline,
  disc: THREE.Object3D,
  at: number,
  duration: number,
  from: () => { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number },
  to: { pos: THREE.Vector3; tilt: number; scale: number },
  lift: number,
  spin: number,
  ease: string,
) {
  const p = { t: 0 }
  let f: ReturnType<typeof from>
  const ctrl = v3()
  const tilt = q4()
  const spinQ = q4()
  tl.call(() => {
    f = from()
    p.t = 0
  }, [], at)
  tl.to(p, {
    t: 1,
    duration,
    ease,
    onUpdate: () => {
      ctrl.lerpVectors(f.pos, to.pos, 0.5)
      ctrl.y += lift
      bezier(f.pos, ctrl, to.pos, p.t, disc.position)
      tilt.setFromAxisAngle(X, to.tilt * p.t)
      spinQ.setFromAxisAngle(Z, -spin * p.t)
      disc.quaternion.slerpQuaternions(f.quat, tilt, Math.min(1, p.t * 1.6)).multiply(spinQ)
      disc.scale.setScalar(THREE.MathUtils.lerp(f.scale, to.scale, p.t))
    },
  }, at)
}

// --- Insert ---------------------------------------------------------------------------

export function insertDvd(p: Project, index: number, navigate: Navigate) {
  const flashEl = flashElement()
  if (isLocked()) return
  const c = jukeApi.ctx()
  const h = dvdRegistry.get(p.slug)
  if (!c || !h) {
    // Scene not ready: just open the page.
    useTransition.getState().set({ phase: 'open', pageSlug: p.slug })
    navigate(`/project/${p.slug}`)
    return
  }
  const T = TRANSITION.insert
  const cam = c.camera as THREE.PerspectiveCamera
  useTransition.getState().set({ phase: 'inserting' })
  takeOverJuke()
  saved = {
    slug: p.slug,
    index,
    caseParent: h.root.parent!,
    discParent: h.disc.parent!,
    cam: { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov },
  }
  const startWorld = h.root.getWorldPosition(v3())
  playDvdSelect(index, THREE.MathUtils.clamp(startWorld.clone().project(cam).x, -1, 1))

  const P = c.pose.parts
  const hand = c.parts.hand_R
  const head = c.parts.head
  const look = c.rig.lookOverride
  const tl = gsap.timeline()
  current?.kill()
  current = tl

  // 1. The project's expression; look at the DVD and reach for it.
  const g = gazeAt(c, startWorld)
  tl.call(() => expr(p.jukeExpression), [], 0)
    .to(look, { weight: 1, x: g.x, y: g.y, duration: 0.25, ease: 'power2.out' }, 0)
    .to(P.hand_R, { ...CATCH, duration: 0.42, ease: 'back.out(1.5)' }, 0.06)
    .to(h.ctrl, { straight: 1, duration: 0.35 }, T.fly[0])

  // 2. The DVD flies (with a flip) into his hand.
  flyCase(tl, h, T.fly[0], T.fly[1] - T.fly[0], () => {
    hand.updateWorldMatrix(true, false)
    return {
      pos: hand.localToWorld(HOLD_POS.clone()),
      quat: hand.getWorldQuaternion(q4()).multiply(HOLD_QUAT),
      scale: TRANSITION.holdScale,
    }
  }, true)
  tl.call(() => {
    hand.attach(h.root)
    h.root.position.copy(HOLD_POS)
    h.root.quaternion.copy(HOLD_QUAT)
  }, [], T.catch)
    .fromTo(P.hand_R, { s: 0.18 }, { s: 0, duration: 0.35, ease: 'elastic.out(1, 0.4)', immediateRender: false }, T.catch)
    .to(look, { x: 0.55, y: 0.15, duration: 0.2 }, T.catch)

  // 3. Cassette door opens with a bounce; the case lid opens.
  tl.to(P.cassette_door, { rx: 1.2, duration: 0.45, ease: 'back.out(2.4)' }, T.doorOpen)
    .to(h.ctrl, { open: HOLD_OPEN, duration: 0.3, ease: 'power2.out' }, T.lidOpen)

  // 4. The disc leaves the case, spins over to the slot and slides in.
  tl.call(() => {
    h.ctrl.discFree = true
    head.attach(h.disc)
  }, [], T.discOut[0])
    .to(look, { x: 0, y: -0.7, duration: 0.25 }, T.discOut[0] + 0.2)
  discMove(
    tl, h.disc, T.discOut[0], T.discOut[1] - T.discOut[0],
    () => ({ pos: h.disc.position.clone(), quat: h.disc.quaternion.clone(), scale: h.disc.scale.x }),
    { pos: DISC_FRONT, tilt: 0, scale: 0.85 },
    0.12, Math.PI * 4, 'power2.inOut',
  )
  discMove(
    tl, h.disc, T.discIn[0], T.discIn[1] - T.discIn[0],
    () => ({ pos: DISC_FRONT.clone(), quat: q4(), scale: 0.85 }),
    { pos: DISC_INSIDE, tilt: DISC_TILT, scale: 0.55 },
    0, Math.PI * 3, 'power2.in',
  )
  tl.call(() => {
    h.disc.visible = false
  }, [], T.discIn[1])

  //    The empty case pops away; the hand goes back down.
  tl.to(h.ctrl, { open: 0, duration: 0.18 }, T.discIn[0])
    .to(h.root.scale, { x: 0, y: 0, z: 0, duration: 0.28, ease: 'back.in(2.2)' }, T.discIn[0] + 0.1)
    .call(() => {
      h.root.visible = false
    }, [], T.discIn[0] + 0.4)
    .to(P.hand_R, { px: 0, py: 0, pz: 0, rz: 0, duration: 0.5, ease: 'power2.inOut' }, T.discIn[0] + 0.3)

  // 5. Door shuts → strong bass thump, excited eyes.
  tl.to(P.cassette_door, { rx: 0, duration: 0.18, ease: 'power3.in' }, T.doorClose)
    .to(look, { x: 0, y: 0, duration: 0.2 }, T.doorClose)
  thump(tl, c, T.thump)

  // 6. Camera pushes into the cassette window.
  tweenCamera(tl, c, () => pushedCamera(c), T.push[0], T.push[1] - T.push[0])

  // 7. Flash → project page.
  tl.call(() => setFlash(p.color), [], T.flash - 0.14)
  if (flashEl) tl.fromTo(flashEl, { opacity: 0 }, { opacity: 1, duration: 0.14, ease: 'power1.in' }, T.flash - 0.14)
  tl.call(() => {
    useTransition.getState().set({ phase: 'open', pageSlug: p.slug })
    navigate(`/project/${p.slug}`)
    expr('neutral')
    look.weight = 0
  }, [], T.flash + 0.05)
  if (flashEl) tl.to(flashEl, { opacity: 0, duration: 0.6, ease: 'power2.out' }, T.flash + 0.12)
}

function flyCase(
  tl: gsap.core.Timeline,
  h: DvdHandle,
  at: number,
  duration: number,
  target: () => { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number },
  toWorld: boolean,
) {
  const p = { t: 0 }
  let from: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number }
  const ctrl = v3()
  const flip = q4()
  const Y = new THREE.Vector3(0, 1, 0)
  tl.call(() => {
    if (toWorld) sceneOf(h.root).attach(h.root)
    from = { pos: h.root.position.clone(), quat: h.root.quaternion.clone(), scale: h.root.scale.x }
    p.t = 0
  }, [], at)
  tl.to(p, {
    t: 1,
    duration,
    ease: 'power2.inOut',
    onUpdate: () => {
      const to = target()
      ctrl.lerpVectors(from.pos, to.pos, 0.5)
      ctrl.y += 0.22
      ctrl.z += 0.12
      bezier(from.pos, ctrl, to.pos, p.t, h.root.position)
      flip.setFromAxisAngle(Y, Math.PI * 2 * p.t)
      h.root.quaternion.slerpQuaternions(from.quat, to.quat, p.t).multiply(flip)
      h.root.scale.setScalar(THREE.MathUtils.lerp(from.scale, to.scale, p.t))
    },
  }, at)
}

// --- Opened directly by URL ---------------------------------------------------------

/** Put the scene in the "DVD inserted, camera pushed in" state without animating. */
function setInsertedState(slug: string, index: number) {
  const c = jukeApi.ctx()
  const h = dvdRegistry.get(slug)
  if (!c || !h) return false
  const cam = c.camera as THREE.PerspectiveCamera
  sceneOf(h.root).updateMatrixWorld(true)
  saved = {
    slug,
    index,
    caseParent: h.root.parent!,
    discParent: h.disc.parent!,
    cam: { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov },
  }
  c.parts.hand_R.attach(h.root)
  h.root.position.copy(HOLD_POS)
  h.root.quaternion.copy(HOLD_QUAT)
  h.root.scale.setScalar(0)
  h.root.visible = false
  h.ctrl.straight = 1
  h.ctrl.discFree = true
  c.parts.head.attach(h.disc)
  h.disc.position.copy(DISC_INSIDE)
  h.disc.quaternion.setFromAxisAngle(X, DISC_TILT)
  h.disc.scale.setScalar(0.55)
  h.disc.visible = false
  const pushed = pushedCamera(c)
  cam.position.copy(pushed.pos)
  cam.quaternion.copy(pushed.quat)
  cam.fov = pushed.fov
  cam.updateProjectionMatrix()
  return true
}

// --- Eject ------------------------------------------------------------------------------

export function ejectDvd(p: Project, index: number, navigate: Navigate) {
  const flashEl = flashElement()
  const slug = p.slug
  const phase = useTransition.getState().phase
  if (phase === 'ejecting' || phase === 'inserting') return
  const closePage = () => {
    useTransition.getState().set({ pageSlug: null })
    if (location.pathname !== '/') navigate('/')
  }
  if (!saved || saved.slug !== slug) {
    if (!setInsertedState(slug, index)) {
      // Scene isn't ready (e.g. still loading): just close the page.
      closePage()
      useTransition.getState().set({ phase: 'idle' })
      return
    }
  }
  const s = saved!
  const c = jukeApi.ctx()!
  const h = dvdRegistry.get(slug)!
  const E = TRANSITION.eject
  const P = c.pose.parts
  const look = c.rig.lookOverride
  useTransition.getState().set({ phase: 'ejecting' })
  takeOverJuke()
  playDvdEject(s.index)

  const tl = gsap.timeline()
  current?.kill()
  current = tl
  // Flash over the page, swap it out, fade back to the cassette window.
  tl.call(() => setFlash(p.color), [], 0)
  if (flashEl) tl.fromTo(flashEl, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.in' }, 0)
  tl.call(closePage, [], 0.2)
  if (flashEl) tl.to(flashEl, { opacity: 0, duration: 0.45, ease: 'power2.out' }, E.reveal)

  // Camera pulls back.
  tweenCamera(tl, c, () => s.cam, E.pull[0], E.pull[1] - E.pull[0])

  // Door opens, the hand comes up and the case reappears in it, lid open.
  tl.call(() => expr('happy'), [], E.pull[0])
    .to(P.cassette_door, { rx: 1.2, duration: 0.4, ease: 'back.out(2.4)' }, E.doorOpen)
    .to(P.hand_R, { ...CATCH, duration: 0.4, ease: 'back.out(1.5)' }, E.doorOpen - 0.25)
    .call(() => {
      h.root.visible = true
    }, [], E.discOut[0] - 0.15)
    .fromTo(h.root.scale, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'back.out(2)', immediateRender: false }, E.discOut[0] - 0.15)
    .to(h.ctrl, { open: HOLD_OPEN, duration: 0.25 }, E.discOut[0] - 0.1)
    .to(look, { weight: 1, x: 0, y: -0.7, duration: 0.25 }, E.doorOpen)

  // The disc pops out of the slot...
  tl.call(() => {
    h.disc.visible = true
  }, [], E.discOut[0])
  discMove(
    tl, h.disc, E.discOut[0], E.discOut[1] - E.discOut[0],
    () => ({ pos: DISC_INSIDE.clone(), quat: q4().setFromAxisAngle(X, DISC_TILT), scale: 0.55 }),
    { pos: DISC_FRONT, tilt: 0, scale: 0.85 },
    0, Math.PI * 3, 'power2.out',
  )
  // ...and drops back into its case.
  const home = { t: 0 }
  let from: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number }
  tl.call(() => {
    s.discParent.attach(h.disc)
    from = { pos: h.disc.position.clone(), quat: h.disc.quaternion.clone(), scale: h.disc.scale.x }
  }, [], E.discHome[0])
    .to(home, {
      t: 1,
      duration: E.discHome[1] - E.discHome[0],
      ease: 'power2.inOut',
      onUpdate: () => {
        h.disc.position.lerpVectors(from.pos, ZERO, home.t)
        h.disc.quaternion.slerpQuaternions(from.quat, IDENTITY, home.t)
        h.disc.scale.setScalar(THREE.MathUtils.lerp(from.scale, 1, home.t))
      },
    }, E.discHome[0])
    .call(() => {
      h.ctrl.discFree = false
    }, [], E.discHome[1])
    .to(h.ctrl, { open: 0, duration: 0.2, ease: 'power2.in' }, E.discHome[1] - 0.05)
    .to(look, { x: 0.55, y: 0.15, duration: 0.2 }, E.discHome[0])

  // Door shuts; the DVD floats back to its place on the shelf.
  tl.to(P.cassette_door, { rx: 0, duration: 0.18, ease: 'power3.in' }, E.doorClose)
  const back = { t: 0 }
  let start: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number }
  const ctrl = v3()
  tl.call(() => {
    s.caseParent.attach(h.root)
    start = { pos: h.root.position.clone(), quat: h.root.quaternion.clone(), scale: h.root.scale.x }
  }, [], E.flyBack[0])
    .to(back, {
      t: 1,
      duration: E.flyBack[1] - E.flyBack[0],
      ease: 'power2.inOut',
      onUpdate: () => {
        ctrl.copy(start.pos).multiplyScalar(0.5)
        ctrl.y += 0.2
        bezier(start.pos, ctrl, ZERO, back.t, h.root.position)
        h.root.quaternion.slerpQuaternions(start.quat, IDENTITY, back.t)
        h.root.scale.setScalar(THREE.MathUtils.lerp(start.scale, 1, back.t))
      },
    }, E.flyBack[0])
    .to(h.ctrl, { straight: 0, duration: 0.5 }, E.flyBack[1] - 0.2)
    .to(P.hand_R, { px: 0, py: 0, pz: 0, rz: 0, duration: 0.45, ease: 'power2.inOut' }, E.flyBack[0])
    .to(look, { x: 0, y: 0, duration: 0.3 }, E.flyBack[0])

  // Juke waves goodbye with his other hand.
  const L = P.hand_L
  tl.to(L, { px: -0.27, py: 0.49, pz: 0.08, rz: -0.3, duration: 0.4, ease: 'back.out(1.6)' }, E.wave)
    .to(L, { rz: 0.5, duration: 0.17, repeat: 5, yoyo: true, ease: 'sine.inOut' }, E.wave + 0.4)
    .to(L, { px: 0, py: 0, pz: 0, rz: 0, duration: 0.5, ease: 'power2.inOut' }, E.wave + 1.25)
    .to(look, { weight: 0, duration: 0.4 }, E.wave + 1.25)
    .call(() => {
      expr('neutral')
      saved = null
      useTransition.getState().set({ phase: 'idle' })
      releaseJuke()
    }, [], E.wave + 1.8)
}

const ZERO = new THREE.Vector3()
const IDENTITY = new THREE.Quaternion()
