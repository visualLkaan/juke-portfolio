import * as THREE from 'three'
import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ROOM } from '../juke/config'
import { ATMOS_GLSL, atmos } from './atmosphere'
import { BG_DISTANCE, CAMERA, PHOTO } from './layout'

/**
 * Dust motes drifting through the room. They're nearly invisible in the shade and
 * light up while they float through a light shaft (same shaft function as the
 * background), fading out again when they leave it.
 */
export function Dust({ count = ROOM.dust.count }: { count?: number }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const { geometry, material } = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      // A volume between Juke and the back wall, wider at the back.
      const z = THREE.MathUtils.lerp(-4, 2.8, Math.random())
      const spread = THREE.MathUtils.lerp(1.6, 4, (2.8 - z) / 6.8)
      pos.set([(Math.random() * 2 - 1) * spread, THREE.MathUtils.lerp(0.15, 2.6, Math.random()), z], i * 3)
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 4))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 10)

    const halfH = BG_DISTANCE * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2))
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: atmos.uTime,
        uWind: atmos.uWind,
        uSun: atmos.uSun,
        uSize: { value: ROOM.dust.size },
        uPixel: { value: 1 },
        uBg: { value: new THREE.Vector4(CAMERA.position[0], CAMERA.position[1], halfH * PHOTO.aspect, halfH) },
        uBgZ: { value: CAMERA.position[2] - BG_DISTANCE },
      },
      vertexShader: /* glsl */ `
        ${ATMOS_GLSL}
        attribute vec4 seed;
        uniform float uSize;
        uniform float uPixel;
        uniform vec4 uBg; // background centre xy, half size xy
        uniform float uBgZ;
        varying float vGlow;
        varying float vTwinkle;
        void main() {
          vec3 p = position;
          float t = uTime * (0.6 + seed.x * 0.5);
          // Lazy drift, a slow fall, and a nudge from the wind.
          p.x += sin(t * 0.21 + seed.y * 40.0) * 0.25 + sin(uWind * 0.4 + seed.z * 6.0) * 0.08;
          p.y += sin(t * 0.17 + seed.z * 30.0) * 0.18 - mod(uTime * 0.012 * (0.5 + seed.w) + seed.w * 3.0, 3.0) + 1.5;
          p.z += cos(t * 0.19 + seed.x * 50.0) * 0.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;

          // Where this mote sits in front of the photo (project from the camera onto it).
          vec3 cam = cameraPosition;
          float k = (cam.z - uBgZ) / max(cam.z - p.z, 0.05);
          vec2 onBg = cam.xy + (p.xy - cam.xy) * k;
          vec2 photoUv = (onBg - uBg.xy) / (2.0 * uBg.zw) + 0.5;
          vGlow = lightShaft(photoUv);
          vTwinkle = 0.75 + 0.25 * sin(uTime * (1.0 + seed.y * 2.0) + seed.x * 20.0);
          gl_PointSize = uSize * uPixel * (0.6 + seed.w * 0.8) / -mv.z;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vGlow;
        varying float vTwinkle;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, r);
          float alpha = a * (0.06 + vGlow * 1.6) * vTwinkle;
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.62) * alpha, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry, material }
  }, [count])

  useFrame(() => {
    // Point size in pixels for a mote of world size uSize at distance 1.
    const cam = camera as THREE.PerspectiveCamera
    material.uniforms.uPixel.value = ((size.height * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)))) * cam.zoom
  })

  return <points geometry={geometry} material={material} renderOrder={1} frustumCulled={false} />
}
