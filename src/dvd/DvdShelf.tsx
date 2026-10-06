import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useFrame, useThree } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import { useControls } from 'leva'
import type { Project } from '../data/projects'
import { useJukeStore } from '../juke/useJukeStore'
import { CAMERA } from '../scene/layout'
import { CASE, FLOAT, RAIL, SHELF } from './config'
import { isRailLayout } from './layoutMode'
import { motionScale } from '../scene/motion'
import { DvdCase, type DvdHandle } from './DvdCase'
import { isLocked, useTransition } from '../transitions/transitionStore'
import { playDvdHover, playSideFlip } from './dvdSounds'
import { jukeApi } from '../juke/jukeApi'
import { dvdFocus, dvdRegistry, rail, useDvdStore } from './dvdState'

export { isRailLayout }

type Slot = {
  position: [number, number, number]
  yaw: number
  tilt: [number, number, number]
  scale: number
  speed: number
}

/** Seeded jitter so the scatter is stable between reloads. */
function jitter(i: number, k: number) {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/**
 * A loose rainbow arc of DVDs to Juke's right. Up to 7 projects sit on one arc;
 * more get a second, inner arc (staggered, slightly smaller cases).
 */
function arcSlots(n: number): Slot[] {
  const rows = n <= SHELF.singleRowMax ? 1 : 2
  const sizes = Array.from({ length: rows }, (_, r) => 1 - r * SHELF.rowShrink)
  const total = sizes.reduce((a, b) => a + b, 0)
  const counts = sizes.map((f) => Math.floor((n * f) / total))
  for (let left = n - counts.reduce((a, b) => a + b, 0), r = 0; left > 0; left--, r = (r + 1) % rows) counts[r]++

  const scale = SHELF.scale * (rows > 1 ? 0.84 : 1)
  const [a0, a1] = SHELF.angles.map(THREE.MathUtils.degToRad)
  const slots: Slot[] = []
  counts.forEach((m, row) => {
    for (let j = 0; j < m; j++) {
      const i = slots.length
      // With two rows, the inner one is shifted half a step so the DVDs don't line up.
      // A short list keeps the full-arc spacing and starts next to Juke.
      const f = rows === 1 ? (m < 6 ? 0.1 + j / 5 : j / (m - 1)) : row % 2 ? (j + 0.5) / m : j / (m - 1)
      // Even spacing across the screen (not along the arc), so the ends don't bunch up.
      const a = Math.acos(THREE.MathUtils.lerp(Math.cos(a0), Math.cos(a1), f)) + jitter(i, 1) * 0.05
      const k = sizes[row] + jitter(i, 2) * SHELF.jitter
      const x = SHELF.center[0] + Math.cos(a) * SHELF.radius[0] * k
      const z = SHELF.z + row * SHELF.rowDepth + jitter(i, 4) * SHELF.jitter
      slots.push({
        position: [x, SHELF.center[1] + Math.sin(a) * SHELF.radius[1] * k + jitter(i, 3) * SHELF.jitter, z],
        // Face the camera (so covers stay readable at the ends)...
        yaw: Math.atan2(CAMERA.position[0] - x, CAMERA.position[2] - z),
        // ...then lean toward Juke with a little scatter (eased out on hover).
        tilt: [jitter(i, 5) * 0.06, SHELF.faceJuke + jitter(i, 6) * 0.08, jitter(i, 7) * SHELF.tilt],
        scale,
        speed: THREE.MathUtils.lerp(FLOAT.speed[0], FLOAT.speed[1], (jitter(i, 8) + 1) / 2),
      })
    }
  })
  return slots
}

/**
 * The floating DVDs. All projects are mounted (so both sides' covers are ready),
 * but only the current side of the "tape" is shown; flipping sides sends the DVDs
 * spinning out and the other side's DVDs swooping in.
 */
export function DvdShelf({ projects: all, onSelect }: { projects: Project[]; onSelect: (p: Project) => void }) {
  const size = useThree((s) => s.size)
  const railMode = isRailLayout(size.width, size.height)
  const side = useDvdStore((s) => s.side)
  const [shownSide, setShownSide] = useState(side)
  const switching = useRef(false)

  // Each DVD's slot within its own side's arc.
  const layout = useMemo(() => {
    const bySide = new Map<string, Project[]>()
    for (const p of all) bySide.set(p.side, [...(bySide.get(p.side) ?? []), p])
    const slotsBySide = new Map([...bySide].map(([k, list]) => [k, arcSlots(list.length)]))
    return all.map((p) => {
      const i = bySide.get(p.side)!.indexOf(p)
      return { index: i, slot: slotsBySide.get(p.side)![i] }
    })
  }, [all])

  const hovered = useDvdStore((s) => s.hovered)
  const setHovered = useDvdStore((s) => s.setHovered)
  const groups = useRef<(THREE.Group | null)[]>([])
  const inners = useRef<(THREE.Group | null)[]>([])
  const cases = useRef<(DvdHandle | null)[]>([])
  // 0 = gone, 1 = in place; tweened when the side flips.
  const appear = useRef(all.map((p) => ({ v: p.side === side ? 1 : 0 })))

  const dev = useControls('DVDs', {
    open: { value: 0, min: 0, max: 1, step: 0.01 },
  })

  // Hover → Juke looks at the DVD and makes a light version of its expression.
  useEffect(() => {
    const i = all.findIndex((p) => p.slug === hovered)
    dvdFocus.slug = hovered
    dvdFocus.object = i >= 0 ? (cases.current[i]?.root ?? null) : null
    useJukeStore.getState().setSoft(i >= 0 ? all[i].jukeExpression : null)
    document.body.style.cursor = i >= 0 ? 'pointer' : ''
  }, [hovered, all])

  useEffect(() => {
    all.forEach((p, i) => {
      const c = cases.current[i]
      if (c) dvdRegistry.set(p.slug, c)
    })
    return () => all.forEach((p) => dvdRegistry.delete(p.slug))
  }, [all])

  // Flip sides: out with the old DVDs, in with the new (instantly while a project
  // page is open — e.g. opening a side-B project by its link).
  useEffect(() => {
    if (side === shownSide) return
    setHovered(null)
    const outs = all.flatMap((p, i) => (p.side === shownSide ? [appear.current[i]] : []))
    const ins = all.flatMap((p, i) => (p.side === side ? [appear.current[i]] : []))
    if (useTransition.getState().phase !== 'idle') {
      outs.forEach((o) => (o.v = 0))
      ins.forEach((o) => (o.v = 1))
      setShownSide(side)
      return
    }
    switching.current = true
    jukeApi.director?.flipTape()
    playSideFlip(side)
    gsap
      .timeline({ onComplete: () => (switching.current = false) })
      .to(outs, { v: 0, duration: 0.45, ease: 'back.in(1.7)', stagger: 0.05 })
      .call(() => setShownSide(side))
      .to(ins, { v: 1, duration: 0.75, ease: 'back.out(1.6)', stagger: 0.07 }, '-=0.1')
  }, [side, shownSide, all, setHovered])

  // A transition takes over: drop the hover (Juke's gaze, the soft expression).
  const phase = useTransition((s) => s.phase)
  useEffect(() => {
    if (phase !== 'idle') setHovered(null)
  }, [phase, setHovered])

  // Leaving rail mode (or unmounting) must not leave a stale hover behind.
  useEffect(() => () => setHovered(null), [railMode, setHovered])

  useFrame(({ camera }) => {
    // Side-flip motion: DVDs spin away up and to the right, and swoop back in.
    inners.current.forEach((g, i) => {
      if (!g) return
      const v = appear.current[i].v
      const u = 1 - v
      g.visible = v > 0.002
      g.position.set(u * 1.1, u * 0.45, -u * 0.3)
      g.rotation.set(0, -u * 1.1, u * 1.7)
      g.scale.setScalar(Math.max(0.001, v))
    })

    // Mobile: lay the DVDs out in a row along the bottom, following the HTML scroller.
    if (!railMode) return
    const cam = camera as THREE.PerspectiveCamera
    const dist = cam.position.z - RAIL.z
    const visibleH = (2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / cam.zoom
    const wpp = visibleH / size.height
    const s = Math.min((RAIL.itemPx * 0.8 * wpp) / CASE.width, (RAIL.heightPx * 0.78 * wpp) / CASE.height)
    const y = cam.position.y - visibleH / 2 + (RAIL.heightPx / 2) * wpp
    groups.current.forEach((g, i) => {
      if (!g) return
      const px = rail.pad + layout[i].index * RAIL.itemPx + RAIL.itemPx / 2 - rail.scroll - size.width / 2
      g.position.set(cam.position.x + px * wpp, y, RAIL.z)
      g.scale.setScalar(s)
    })
  })

  const usable = (p: Project) => !railMode && !isLocked() && !switching.current && p.side === shownSide

  return (
    <group>
      {all.map((p, i) => {
        const { slot } = layout[i]
        return (
          <group
            key={p.slug}
            ref={(g) => {
              groups.current[i] = g
            }}
            position={railMode ? undefined : slot.position}
            rotation-y={railMode ? 0 : slot.yaw}
            scale={railMode ? undefined : slot.scale}
          >
            <group
              ref={(g) => {
                inners.current[i] = g
              }}
            >
              <Float
                speed={slot.speed * motionScale(0.5)}
                rotationIntensity={(railMode ? FLOAT.rotationIntensity * 0.4 : FLOAT.rotationIntensity) * motionScale()}
                floatIntensity={(railMode ? FLOAT.floatIntensity * 0.4 : FLOAT.floatIntensity) * motionScale()}
                floatingRange={FLOAT.range}
              >
                <DvdCase
                  ref={(g) => {
                    cases.current[i] = g
                  }}
                  project={p}
                  tilt={railMode ? [0, 0, slot.tilt[2] * 0.3] : slot.tilt}
                  hovered={hovered === p.slug}
                  open={dev.open}
                  onPointerOver={(e) => {
                    if (!usable(p)) return
                    e.stopPropagation()
                    if (useDvdStore.getState().hovered === p.slug) return
                    setHovered(p.slug)
                    // Pan the sparkle with the DVD's place on screen.
                    playDvdHover(p, THREE.MathUtils.clamp(e.pointer.x, -1, 1), i)
                  }}
                  onPointerOut={(e) => {
                    if (railMode) return
                    e.stopPropagation()
                    if (useDvdStore.getState().hovered === p.slug) setHovered(null)
                  }}
                  onClick={(e) => {
                    if (!usable(p)) return
                    e.stopPropagation()
                    onSelect(p)
                  }}
                />
              </Float>
            </group>
          </group>
        )
      })}
    </group>
  )
}
