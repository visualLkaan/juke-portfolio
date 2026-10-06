import * as THREE from 'three'
import { useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ROOM } from '../juke/config'
import { useTransition } from '../transitions/transitionStore'
import { atmos } from './atmosphere'
import { CAMERA, JUKE, PHOTO, PORTRAIT } from './layout'

// Dev only: ?closeup frames Juke's face to check the eyes and brows.
const CLOSEUP = import.meta.env.DEV && new URLSearchParams(location.search).has('closeup')

/**
 * Keeps the photo covering the screen: on viewports wider than the photo we zoom in
 * (which scales Juke and the background together, so they stay aligned).
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const rest = useMemo(() => new THREE.Vector3(...CAMERA.position), [])
  const target = useMemo(() => new THREE.Vector3(), [])

  useLayoutEffect(() => {
    const aspect = size.width / size.height
    // Look straight down -Z: R3F aims the default camera at the origin, which would
    // tilt it and break the photo's straight verticals.
    camera.rotation.set(0, 0, 0)
    camera.zoom = Math.max(1, aspect / PHOTO.aspect)
    camera.position.set(...CAMERA.position)
    if (aspect < 1) {
      // Portrait screens only see a slice of the room: centre it on Juke, and zoom in
      // a touch so the camera can drop and lift him clear of the DVD row at the bottom.
      camera.zoom = PORTRAIT.zoom
      camera.position.x = JUKE.position[0] * 0.85
      camera.position.y -= PORTRAIT.drop
    }
    if (CLOSEUP) {
      const [x, , z] = JUKE.position
      const head = new THREE.Vector3(x, JUKE.scale * 0.65, z)
      camera.position.set(x + Math.sin(JUKE.rotationY) * 1.1, head.y + 0.05, z + Math.cos(JUKE.rotationY) * 1.1)
      camera.lookAt(head)
    }
    rest.copy(camera.position)
    camera.updateProjectionMatrix()
  }, [camera, size, rest])

  // A touch of camera drift with the pointer, matching the photo's depth parallax
  // so Juke and the DVDs shift with the room. Transitions own the camera.
  useFrame((_, dt) => {
    if (CLOSEUP || useTransition.getState().phase !== 'idle') return
    const m = atmos.uMouse.value
    target.set(rest.x + m.x * ROOM.cameraDrift[0], rest.y + m.y * ROOM.cameraDrift[1], rest.z)
    camera.position.lerp(target, 1 - Math.exp(-4 * Math.min(dt, 0.1)))
  })

  return null
}
