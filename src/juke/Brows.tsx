import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BROWS, FACE } from './config'
import type { FaceRig } from './faceRig'

type Side = 'L' | 'R'

/**
 * Thin floating ink brows above each eye plate, parented to the head.
 * `anchor` is the speaker's top-front point in head space.
 */
export function Brow({ side, rig, anchor, plateRadius }: {
  side: Side
  rig: FaceRig
  anchor: THREE.Vector3
  plateRadius: number
}) {
  const ref = useRef<THREE.Group>(null!)
  const width = plateRadius * 2 * BROWS.width

  const geometry = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-width / 2, 0, 0),
      new THREE.Vector3(0, BROWS.arch * 2, 0),
      new THREE.Vector3(width / 2, 0, 0),
    )
    return new THREE.TubeGeometry(curve, 24, BROWS.thickness / 2, 8, false)
  }, [width])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: BROWS.color }), [])

  // Inner end is towards the face centre: +X for the left brow, -X for the right.
  const inner = side === 'L' ? 1 : -1

  useFrame(() => {
    const e = rig.eyes[side]
    const g = ref.current
    g.position.set(
      anchor.x - inner * e.browAngle * 0.006,
      anchor.y + BROWS.gap + e.browHeight * BROWS.heightRange,
      anchor.z + 0.004,
    )
    // Angry (+) pulls the inner end down.
    g.rotation.z = -inner * e.browAngle * 0.55
  })

  const cap = BROWS.thickness / 2
  return (
    <group ref={ref}>
      <mesh geometry={geometry} material={material} />
      <mesh position={[-width / 2, 0, 0]} material={material}>
        <sphereGeometry args={[cap, 10, 8]} />
      </mesh>
      <mesh position={[width / 2, 0, 0]} material={material}>
        <sphereGeometry args={[cap, 10, 8]} />
      </mesh>
    </group>
  )
}

/** Pink cheek blush under an eye; fades in with the `shy`/`love` expressions. */
export function Blush({ rig, position, size }: {
  rig: FaceRig
  position: [number, number, number]
  size: number
}) {
  const ref = useRef<THREE.MeshBasicMaterial>(null!)
  const map = useMemo(() => {
    const s = 64
    const cv = document.createElement('canvas')
    cv.width = cv.height = s
    const ctx = cv.getContext('2d')!
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.7)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    return new THREE.CanvasTexture(cv)
  }, [])

  useFrame(() => {
    ref.current.opacity = rig.blush * 0.85
  })

  return (
    <mesh position={position} scale={[size, size * 0.5, 1]}>
      <planeGeometry />
      <meshBasicMaterial
        ref={ref}
        map={map}
        color={FACE.colors.blush}
        transparent
        depthWrite={false}
        opacity={0}
      />
    </mesh>
  )
}
