import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { ROOM } from '../juke/config'
import { atmos, weather } from './atmosphere'
import { motionScale } from './motion'

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/**
 * Drives the shared atmosphere every frame: wind, the slow breathing of the
 * sunlight, the occasional passing cloud, and the smoothed pointer (or the phone's
 * tilt) used for the depth parallax.
 */
export function WeatherDriver() {
  const tilt = useMemo(() => ({ on: false, v: new THREE.Vector2() }), [])
  const cloud = useMemo(() => ({ next: rand(ROOM.cloud.minGap, ROOM.cloud.maxGap), start: -1, hold: 0 }), [])

  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __weather: weather, __atmos: atmos })
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      tilt.on = true
      tilt.v.set(THREE.MathUtils.clamp(e.gamma / 25, -1, 1), THREE.MathUtils.clamp((e.beta - 45) / 25, -1, 1))
    }
    window.addEventListener('deviceorientation', onTilt)
    return () => window.removeEventListener('deviceorientation', onTilt)
  }, [tilt])

  useFrame(({ pointer, clock }, dt) => {
    const t = clock.elapsedTime
    dt = Math.min(dt, 0.1)
    atmos.uTime.value = t
    atmos.uWind.value += dt * ROOM.windSpeed * motionScale(0.35) * (1 + weather.gust * 4)
    weather.gust = Math.max(0, weather.gust - dt * 0.6)

    // Passing cloud: fade in, hold, fade out, then wait a while.
    const C = ROOM.cloud
    if (cloud.start < 0 && t > cloud.next) {
      cloud.start = t
      cloud.hold = rand(C.hold[0], C.hold[1])
    }
    if (cloud.start >= 0) {
      const k = t - cloud.start
      const total = C.fadeIn + cloud.hold + C.fadeOut
      weather.cloud =
        k < C.fadeIn ? smooth(k / C.fadeIn) : k < C.fadeIn + cloud.hold ? 1 : smooth(1 - (k - C.fadeIn - cloud.hold) / C.fadeOut)
      if (k > total) {
        cloud.start = -1
        weather.cloud = 0
        cloud.next = t + rand(C.minGap, C.maxGap)
      }
    }
    const breath = Math.sin((t / ROOM.breath.period) * Math.PI * 2) * ROOM.breath.amount + Math.sin(t * 0.97) * 0.015
    atmos.uSun.value = (1 + breath) * (1 - C.dim * weather.cloud)

    // Parallax follows the pointer (or phone tilt) — not at all with reduced motion.
    const target = tilt.on ? tilt.v : pointer
    atmos.uMouse.value.lerp(target, (1 - Math.exp(-3 * dt)) * (motionScale(0) ? 1 : 0))
  })
  return null
}

const smooth = (x: number) => {
  const c = THREE.MathUtils.clamp(x, 0, 1)
  return c * c * (3 - 2 * c)
}
