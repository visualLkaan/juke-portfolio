import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PARTICLES } from './config'
import { particleQueue, type ParticleType } from './particleQueue'

type P = {
  sprite: THREE.Sprite
  mat: THREE.SpriteMaterial
  alive: boolean
  type: ParticleType
  age: number
  life: number
  vel: THREE.Vector3
  size: number
  spin: number
  seed: number
}

const INK = '#120c08'

/** Flat cartoon glyphs: white fill (tinted per particle) with a bold ink outline. */
function makeTextures() {
  const make = (draw: (ctx: CanvasRenderingContext2D, s: number) => void) => {
    const s = 128
    const cv = document.createElement('canvas')
    cv.width = cv.height = s
    const ctx = cv.getContext('2d')!
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    draw(ctx, s)
    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }
  const fillStroke = (ctx: CanvasRenderingContext2D, w = 9) => {
    ctx.lineWidth = w
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  }
  return {
    note: make((ctx) => {
      // ♪ : head, stem and flag drawn as one outlined shape
      ctx.beginPath()
      ctx.ellipse(46, 92, 22, 16, -0.4, 0, Math.PI * 2)
      ctx.moveTo(60, 88)
      ctx.lineTo(60, 22)
      ctx.lineTo(70, 22)
      ctx.quadraticCurveTo(80, 44, 102, 52)
      ctx.quadraticCurveTo(90, 60, 70, 48)
      ctx.lineTo(70, 88)
      ctx.closePath()
      fillStroke(ctx)
    }),
    heart: make((ctx) => {
      ctx.beginPath()
      ctx.moveTo(64, 108)
      ctx.bezierCurveTo(10, 72, 18, 18, 64, 40)
      ctx.bezierCurveTo(110, 18, 118, 72, 64, 108)
      ctx.closePath()
      fillStroke(ctx)
    }),
    sweat: make((ctx) => {
      ctx.beginPath()
      ctx.moveTo(64, 14)
      ctx.bezierCurveTo(70, 40, 98, 64, 98, 84)
      ctx.arc(64, 84, 34, 0, Math.PI)
      ctx.bezierCurveTo(30, 64, 58, 40, 64, 14)
      ctx.closePath()
      fillStroke(ctx, 8)
      ctx.beginPath()
      ctx.ellipse(52, 82, 7, 12, 0.3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fill()
    }),
    z: make((ctx) => {
      ctx.font = '900 104px "Arial Black", Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 12
      ctx.strokeStyle = INK
      ctx.strokeText('Z', 64, 68)
      ctx.fillStyle = '#ffffff'
      ctx.fillText('Z', 64, 68)
    }),
  }
}

const TINTS: Record<ParticleType, string[]> = {
  note: ['#ffd23f', '#ff7aa8', '#6fd6ff', '#9dff8a', '#ffffff'],
  heart: ['#ff3b6b', '#ff6f91', '#ff9ab5'],
  sweat: ['#9fdcff'],
  z: ['#ffffff', '#e8eeff'],
}

/** A small pooled sprite system for notes, hearts, sweat drops and sleepy Z's. */
export function Particles() {
  const group = useRef<THREE.Group>(null!)
  const textures = useMemo(makeTextures, [])
  const pool = useMemo<P[]>(
    () =>
      Array.from({ length: PARTICLES.pool }, () => {
        const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false })
        const sprite = new THREE.Sprite(mat)
        sprite.visible = false
        sprite.renderOrder = 5
        return {
          sprite,
          mat,
          alive: false,
          type: 'note' as ParticleType,
          age: 0,
          life: 1,
          vel: new THREE.Vector3(),
          size: 0.05,
          spin: 0,
          seed: 0,
        }
      }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)

    // Spawn queued requests.
    while (particleQueue.length) {
      const req = particleQueue.shift()!
      const p = pool.find((q) => !q.alive)
      if (!p) continue
      const cfg = PARTICLES.types[req.type]
      p.alive = true
      p.type = req.type
      p.age = 0
      p.life = cfg.life * (0.8 + Math.random() * 0.4)
      p.size = cfg.size * (0.8 + Math.random() * 0.4)
      p.seed = Math.random() * 10
      p.spin = (Math.random() - 0.5) * cfg.spin
      p.vel.set((Math.random() - 0.5) * 0.08, cfg.rise, (Math.random() - 0.5) * 0.04)
      if (req.direction) p.vel.addScaledVector(req.direction, 1)
      p.sprite.position.copy(req.position)
      p.mat.map = textures[req.type]
      const tints = TINTS[req.type]
      p.mat.color.set(tints[Math.floor(Math.random() * tints.length)])
      p.mat.rotation = (Math.random() - 0.5) * 0.4
      p.mat.needsUpdate = true
      p.sprite.visible = true
    }

    for (const p of pool) {
      if (!p.alive) continue
      p.age += dt
      const k = p.age / p.life
      if (k >= 1) {
        p.alive = false
        p.sprite.visible = false
        continue
      }
      const pos = p.sprite.position
      if (p.type === 'sweat') {
        // Slides down then drips.
        p.vel.y -= 0.6 * dt
      } else {
        p.vel.multiplyScalar(1 - 0.6 * dt)
        p.vel.y = Math.max(p.vel.y, PARTICLES.types[p.type].rise * 0.4)
      }
      pos.addScaledVector(p.vel, dt)
      // Gentle sideways wiggle.
      pos.x += Math.sin(p.age * 5 + p.seed) * 0.0015 * (p.type === 'sweat' ? 0 : 1)
      p.mat.rotation += p.spin * dt + (p.type === 'note' ? Math.sin(p.age * 8 + p.seed) * 0.02 : 0)

      // Pop in, fade out.
      const pop = Math.min(1, p.age / 0.15)
      const grow = p.type === 'z' ? 0.6 + k * 0.8 : 1
      const s = p.size * grow * (0.6 + 0.4 * easeOutBack(pop))
      p.sprite.scale.set(s, s, s)
      p.mat.opacity = Math.min(pop, 1 - Math.max(0, (k - 0.6) / 0.4))
    }
  })

  return (
    <group ref={group}>
      {pool.map((p, i) => (
        <primitive key={i} object={p.sprite} />
      ))}
    </group>
  )
}

function easeOutBack(x: number) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
