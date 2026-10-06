import * as THREE from 'three'
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import { useFrame, type ThreeElements } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import type { Project } from '../data/projects'
import { CASE, HOVER } from './config'
import { createCoverSet } from './coverTexture'

/** What the insert transition needs to drive a case directly. */
export type DvdHandle = {
  root: THREE.Group
  disc: THREE.Group
  /**
   * Animated by the transitions: lid opening (0..1), `straight` (0..1) removes the
   * resting tilt, `discFree` hands the disc over (no hover slide).
   */
  ctrl: { open: number; straight: number; discFree: boolean }
}

type Props = Omit<ThreeElements['group'], 'ref'> & {
  ref?: Ref<DvdHandle>
  project: Project
  hovered?: boolean
  /** Resting roll/yaw; eased out while hovered so the cover faces the viewer. */
  tilt?: [number, number, number]
  /** 0 = closed, 1 = lid swung fully open (used by the insert transition). */
  open?: number
}

const { width: W, height: H, depth: D, lidThickness: LID, radius: RAD, discRadius: R } = CASE
const GAP = 0.003 // room for the disc between the tray and the lid
const TRAY = D - LID - GAP
const TRAY_FRONT = -D / 2 + TRAY
const EPS = 0.0004

/**
 * A glossy black DVD case built from the project data: printed cover under a clear
 * sleeve, spine, back, a hinged lid and a disc that slides out on hover.
 */
export function DvdCase({ ref, project, hovered = false, tilt = [0, 0, 0], open = 0, ...props }: Props) {
  const covers = useMemo(() => createCoverSet(project), [project])
  useEffect(() => () => covers.dispose(), [covers])

  const mats = useMemo(() => {
    const plastic = new THREE.MeshPhysicalMaterial({
      color: CASE.plastic,
      roughness: 0.38,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    })
    const printed = (map: THREE.Texture) =>
      new THREE.MeshPhysicalMaterial({ map, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.06 })
    const inner = new THREE.MeshStandardMaterial({ map: covers.inner, roughness: 0.75 })
    const disc = new THREE.MeshPhysicalMaterial({
      map: covers.disc,
      transparent: true,
      alphaTest: 0.01,
      roughness: 0.28,
      metalness: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      iridescence: 1,
      iridescenceMap: covers.discIri,
      iridescenceIOR: 1.7,
      iridescenceThicknessRange: [180, 820],
      side: THREE.FrontSide,
    })
    const discBack = new THREE.MeshPhysicalMaterial({
      color: '#d9dde6',
      metalness: 1,
      roughness: 0.12,
      iridescence: 1,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [200, 900],
    })
    const glow = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: project.color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    return {
      plastic,
      front: printed(covers.front),
      spine: printed(covers.spine),
      back: printed(covers.back),
      inner,
      disc,
      discBack,
      glow,
    }
  }, [covers, project.color])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  const root = useRef<THREE.Group>(null!)
  const ctrl = useMemo(() => ({ open: 0, straight: 0, discFree: false }), [])
  useImperativeHandle(ref, () => ({ root: root.current, disc: disc.current, ctrl }), [ctrl])
  const lift = useRef<THREE.Group>(null!)
  const lid = useRef<THREE.Group>(null!)
  const disc = useRef<THREE.Group>(null!)
  const h = useRef(0)

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-HOVER.rate * Math.min(dt, 0.1))
    h.current += ((hovered ? 1 : 0) - h.current) * k
    const v = h.current
    const L = lift.current
    L.position.z = HOVER.forward * v
    L.scale.setScalar(1 + (HOVER.scale - 1) * v)
    const flat = 1 - Math.max(v, ctrl.straight)
    L.rotation.set(tilt[0] * flat, tilt[1] * flat, tilt[2] * flat)
    if (!ctrl.discFree) {
      disc.current.position.x = R * HOVER.discOut * easeOutBack(v)
      disc.current.rotation.z = -v * 0.7
    }
    mats.glow.opacity = v * 0.95
    lid.current.rotation.y = -Math.PI * 0.96 * Math.max(open, ctrl.open)
  })

  return (
    <group ref={root} {...props}>
      <group ref={lift}>
        {/* Soft edge glow behind the case (hover). */}
        <mesh position-z={-D / 2 - 0.004} material={mats.glow} renderOrder={-0.5}>
          <planeGeometry args={[W * 1.55, H * 1.38]} />
        </mesh>

        {/* Tray: back half of the case with spine and back cover. */}
        <RoundedBox args={[W, H, TRAY]} radius={RAD} smoothness={3} position-z={-D / 2 + TRAY / 2} material={mats.plastic} castShadow />
        <mesh position={[-W / 2 - EPS, 0, 0]} rotation-y={-Math.PI / 2} material={mats.spine}>
          <planeGeometry args={[D - RAD * 0.6, H - RAD * 0.6]} />
        </mesh>
        <mesh position-z={-D / 2 - EPS} rotation-y={Math.PI} material={mats.back}>
          <planeGeometry args={[W - RAD * 0.5, H - RAD * 0.5]} />
        </mesh>
        <mesh position-z={TRAY_FRONT + EPS} material={mats.inner}>
          <planeGeometry args={[W - RAD * 2, H - RAD * 2]} />
        </mesh>

        {/* Disc, resting on the tray; slides out of the open edge on hover. */}
        <group position-z={TRAY_FRONT + GAP / 2}>
          <group ref={disc}>
            <mesh position-z={0.0005} material={mats.disc}>
              <circleGeometry args={[R, 96]} />
            </mesh>
            <mesh position-z={-0.0005} rotation-y={Math.PI} material={mats.discBack}>
              <ringGeometry args={[R * 0.1, R, 96]} />
            </mesh>
          </group>
        </group>

        {/* Lid, hinged on the left edge (the spine). */}
        <group ref={lid} position={[-W / 2, 0, D / 2 - LID / 2]}>
          <RoundedBox args={[W, H, LID]} radius={LID * 0.45} smoothness={2} position-x={W / 2} material={mats.plastic} castShadow />
          <mesh position={[W / 2, 0, LID / 2 + EPS]} material={mats.front}>
            <planeGeometry args={[W - 0.0015, H - 0.0015]} />
          </mesh>
          <mesh position={[W / 2, 0, -LID / 2 - EPS]} rotation-y={Math.PI} material={mats.inner}>
            <planeGeometry args={[W - RAD * 2, H - RAD * 2]} />
          </mesh>
          {/* Raised hinge ridge along the spine edge. */}
          <RoundedBox
            args={[0.007, H * 0.97, 0.0035]}
            radius={0.0016}
            smoothness={2}
            position={[0.0055, 0, LID / 2 + 0.0012]}
            material={mats.plastic}
          />
        </group>
      </group>
    </group>
  )
}

function easeOutBack(t: number) {
  const c = 1.4
  const u = t - 1
  return 1 + (c + 1) * u * u * u + c * u * u
}

let glowTex: THREE.CanvasTexture | null = null
/** Shared soft rounded-rectangle halo (white; tinted per project by the material). */
function glowTexture() {
  if (glowTex) return glowTex
  const w = 256
  const h = Math.round((w * (H * 1.38)) / (W * 1.55))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  const pad = w * 0.17
  g.shadowColor = '#fff'
  g.shadowBlur = w * 0.09
  g.fillStyle = '#fff'
  g.beginPath()
  g.roundRect(pad, pad * 0.95, w - pad * 2, h - pad * 1.9, 10)
  g.fill()
  glowTex = new THREE.CanvasTexture(cv)
  return glowTex
}
