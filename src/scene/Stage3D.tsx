import * as THREE from 'three'
import gsap from 'gsap'
import { Suspense, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { PerformanceMonitor, useProgress } from '@react-three/drei'
import { Leva, levaStore, useControls } from 'leva'
import { Juke } from '../juke/Juke'
import { Particles } from '../juke/Particles'
import { jukeApi } from '../juke/jukeApi'
import { ROOM } from '../juke/config'
import { DvdShelf } from '../dvd/DvdShelf'
import { coverLoading } from '../dvd/coverTexture'
import type { Project } from '../data/projects'
import { SHELF_PROJECTS } from '../data/shelf'
import { useLoad } from '../ui/loadState'
import { Background } from './Background'
import { CameraRig } from './CameraRig'
import { Dust } from './Dust'
import { Lights } from './Lights'
import { Reflections } from './Reflections'
import { WeatherDriver } from './WeatherDriver'
import { CAMERA, JUKE } from './layout'
import { reducedMotion } from './motion'

// Keep GSAP on wall-clock time so Juke's timelines stay in sync with useFrame,
// even when a slow device drops frames.
gsap.ticker.lagSmoothing(0)
if (import.meta.env.DEV) Object.assign(window, { __gsap: gsap })

// Phones get a lighter scene: lower resolution cap, half the dust.
const MOBILE = typeof window !== 'undefined' && (window.innerWidth < 768 || matchMedia('(pointer: coarse)').matches)
const MAX_DPR = MOBILE ? 1.5 : 2

// Dev only: lets the browser console (and screenshot scripts) inspect the scene.
function DevExpose() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  if (import.meta.env.DEV) Object.assign(window, { __scene: scene, __cam: camera, __leva: levaStore })
  return null
}

/** Asset loading progress → the intro screen (the code chunk itself counts as the first 35%). */
function ReportProgress() {
  const { progress } = useProgress()
  useEffect(() => {
    useLoad.getState().set({ progress: Math.max(useLoad.getState().progress, 0.35 + (progress / 100) * 0.6) })
  }, [progress])
  return null
}

/**
 * Mounted once everything suspended has loaded. Waits for the DVD covers to be
 * drawn and pre-compiles the shaders (so the first frames after the intro don't
 * hitch), then tells the intro screen the room is ready.
 */
function Ready() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const start = performance.now()
      while (coverLoading.pending > 0 && performance.now() - start < 6000) await new Promise((r) => setTimeout(r, 100))
      try {
        await gl.compileAsync(scene, camera)
      } catch {
        // Older browsers: shaders just compile on first use.
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      if (alive) useLoad.getState().set({ progress: 1, sceneReady: true })
    })()
    return () => {
      alive = false
    }
  }, [gl, scene, camera])
  return null
}

/** After the intro screen: Juke stretches and waves hello. */
function Greeting() {
  const introDone = useLoad((s) => s.introDone)
  useEffect(() => {
    if (!introDone) return
    const t = setTimeout(() => jukeApi.director?.greet(), 250)
    return () => clearTimeout(t)
  }, [introDone])
  return null
}

function Scene({ onSelect }: { onSelect: (p: Project) => void }) {
  const j = useControls('Juke placement', {
    position: { value: JUKE.position, step: 0.01 },
    rotationY: { value: JUKE.rotationY, min: -Math.PI, max: Math.PI, step: 0.01 },
    scale: { value: JUKE.scale, min: 0.2, max: 2, step: 0.01 },
  })
  const [x, y, z] = j.position as [number, number, number]

  return (
    <>
      <DevExpose />
      <WeatherDriver />
      <CameraRig />
      <Background />
      <Lights at={[x, y, z]} shadowSize={MOBILE ? 1024 : 2048} />
      {/* The model spans y -0.5..0.5, so lift it by half its height to stand on y = 0. */}
      <group position={[x, y + 0.5 * j.scale, z]} rotation-y={j.rotationY} scale={j.scale}>
        <Juke />
      </group>
      <Particles />
      <Dust count={Math.round(ROOM.dust.count * (MOBILE ? 0.5 : 1) * (reducedMotion() ? 0.4 : 1))} />
      <Reflections />
      <DvdShelf projects={SHELF_PROJECTS} onSelect={onSelect} />
      <Ready />
      <Greeting />
    </>
  )
}

/** The whole 3D room. Lazy-loaded, so the intro screen shows before three.js arrives. */
export default function Stage3D({ onSelect, paused }: { onSelect: (p: Project) => void; paused: boolean }) {
  const [dpr, setDpr] = useState(MAX_DPR)
  useEffect(() => {
    useLoad.getState().set({ progress: Math.max(useLoad.getState().progress, 0.35) })
  }, [])

  return (
    <>
      <Leva collapsed hidden={!import.meta.env.DEV} />
      <Canvas
        shadows="variance"
        dpr={dpr}
        // The room is fully hidden behind the project page: stop rendering it.
        frameloop={paused ? 'never' : 'always'}
        camera={{ fov: CAMERA.fov, position: CAMERA.position, near: 0.05, far: 50 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.15, powerPreference: 'high-performance' }}
        style={{ position: 'fixed', inset: 0 }}
        aria-hidden="true"
        onCreated={({ gl }) => {
          // Checking every shader for errors makes the browser wait for each compile;
          // only worth it while developing.
          gl.debug.checkShaderErrors = import.meta.env.DEV
        }}
      >
        {/* If the device can't keep up, drop the resolution (and raise it again when it can). */}
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(1, d - 0.5))}
          onIncline={() => setDpr((d) => Math.min(MAX_DPR, d + 0.25))}
          flipflops={3}
          onFallback={() => setDpr(1)}
        />
        <ReportProgress />
        <Suspense fallback={null}>
          <Scene onSelect={onSelect} />
        </Suspense>
      </Canvas>
    </>
  )
}
