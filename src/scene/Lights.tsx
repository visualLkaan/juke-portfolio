import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { atmos } from './atmosphere'
import { folder, useControls } from 'leva'
import { lightRig } from './lightRig'

/**
 * Lighting matched to the photo: low sunset sun from the off-screen window on the
 * front-left, cool green bounce from the walls, a thin orange rim from behind.
 * Shadows land on an invisible floor plane at y = 0 (the rug).
 */
export function Lights({ at, shadowSize = 2048 }: { at: [number, number, number]; shadowSize?: number }) {
  const key = useRef<THREE.DirectionalLight>(null!)
  const rim = useRef<THREE.DirectionalLight>(null!)
  const target = useRef<THREE.Object3D>(null!)

  const c = useControls('Lights', {
    key: folder({
      keyColor: '#ffb35c',
      keyIntensity: { value: 2.4, min: 0, max: 8, step: 0.05 },
      keyPos: { value: [-3.4, 3.4, 2.4], step: 0.1 },
    }),
    fill: folder({
      fillColor: '#9bbf8a',
      fillIntensity: { value: 1.0, min: 0, max: 4, step: 0.05 },
      fillPos: { value: [3, 1.2, 2.5], step: 0.1 },
      skyColor: '#dfe6ea',
      groundColor: '#8a6a4a',
      hemiIntensity: { value: 1.6, min: 0, max: 4, step: 0.05 },
    }),
    rim: folder({
      rimColor: '#ff8a2a',
      rimIntensity: { value: 2.2, min: 0, max: 8, step: 0.05 },
      rimPos: { value: [2.2, 2.2, -3], step: 0.1 },
    }),
    shadows: folder({
      shadowColor: '#4a2410',
      shadowOpacity: { value: 0.55, min: 0, max: 1, step: 0.01 },
      contactOpacity: { value: 0.9, min: 0, max: 1, step: 0.01 },
      contactBlur: { value: 1.4, min: 0, max: 6, step: 0.1 },
      footOpacity: { value: 1, min: 0, max: 1, step: 0.01 },
    }),
  })

  // Lights aim at Juke; publish their directions for the toon shader.
  useEffect(() => {
    key.current.target = target.current
    rim.current.target = target.current
    const t = new THREE.Vector3(...at)
    lightRig.keyDir.set(...(c.keyPos as [number, number, number])).sub(t).normalize()
    lightRig.rimDir.set(...(c.rimPos as [number, number, number])).sub(t).normalize()
  }, [c.keyPos, c.rimPos, at])

  // The key light is the sun: it breathes and dims with the background.
  useFrame(() => {
    key.current.intensity = c.keyIntensity * (1 + (atmos.uSun.value - 1) * 1.3)
  })

  const [jx, , jz] = at
  const kp = c.keyPos as [number, number, number]
  const rp = c.rimPos as [number, number, number]
  const fp = c.fillPos as [number, number, number]

  return (
    <>
      <object3D ref={target} position={[jx, 0.45, jz]} />
      <hemisphereLight args={[c.skyColor, c.groundColor, c.hemiIntensity]} />
      <directionalLight
        ref={key}
        color={c.keyColor}
        intensity={c.keyIntensity}
        position={[jx + kp[0], kp[1], jz + kp[2]]}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-radius={6}
        shadow-blurSamples={16}
        shadow-normalBias={0.02}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
      />
      <directionalLight color={c.fillColor} intensity={c.fillIntensity} position={[jx + fp[0], fp[1], jz + fp[2]]} />
      <directionalLight
        ref={rim}
        color={c.rimColor}
        intensity={c.rimIntensity}
        position={[jx + rp[0], rp[1], jz + rp[2]]}
      />

      {/* Long sunset shadow stretching to the back-right. */}
      <mesh rotation-x={-Math.PI / 2} position={[jx + 0.6, 0.001, jz - 0.4]} receiveShadow>
        <planeGeometry args={[2.4, 1.8]} />
        <shadowMaterial color={c.shadowColor} opacity={c.shadowOpacity} transparent depthWrite={false} />
      </mesh>

      {/* Soft contact shadow right under the feet... */}
      <ContactShadows
        position={[jx, 0.002, jz]}
        scale={1.6}
        far={0.35}
        blur={c.contactBlur}
        opacity={c.contactOpacity}
        resolution={512}
        color="#2a1206"
      />
      {/* ...and a tight, dark occlusion blob under each shoe so he stands ON the rug. */}
      <FootShadow name="shoe_L" opacity={c.footOpacity} />
      <FootShadow name="shoe_R" opacity={c.footOpacity} />
    </>
  )
}

/** Follows a shoe on the floor; fades and grows when the foot lifts. */
function FootShadow({ name, opacity }: { name: string; opacity: number }) {
  const scene = useThree((s) => s.scene)
  const mesh = useRef<THREE.Mesh>(null!)
  const shoe = useRef<THREE.Object3D | null>(null)
  const box = useMemo(() => new THREE.Box3(), [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: opacity }, uColor: { value: new THREE.Color('#1e0c04') } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform float uOpacity;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float r = length(vUv - 0.5) * 2.0;
            float a = (1.0 - smoothstep(0.3, 1.0, r)) * uOpacity * 0.95;
            gl_FragColor = vec4(uColor, a);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useFrame(() => {
    shoe.current ??= scene.getObjectByName(name) ?? null
    const s = shoe.current
    if (!s) return
    box.setFromObject(s)
    const lift = Math.max(0, box.min.y)
    const m = mesh.current
    // The camera looks at the rug at a grazing angle, so a shadow lying flat on the
    // floor would be a few pixels thin (and mostly hidden by the shoe). Instead the
    // blob is tilted up toward the camera, standing in the middle of the shoe: the
    // shoe hides its upper half and the lower half shows as a dark contact pool
    // under the sole.
    m.position.set((box.min.x + box.max.x) / 2 + 0.004, 0.0, (box.min.z + box.max.z) / 2 + 0.035)
    m.scale.set((box.max.x - box.min.x) * 1.5, 0.12, 1).multiplyScalar(1 + lift * 4)
    mat.uniforms.uOpacity.value = opacity * Math.max(0, 1 - lift * 12)
  })
  return (
    <mesh ref={mesh} rotation-x={-0.45} material={mat} renderOrder={2}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
