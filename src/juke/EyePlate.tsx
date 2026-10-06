import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { FACE } from './config'
import type { EyeFrame, FaceRig } from './faceRig'

type Side = 'L' | 'R'

/**
 * A flat disc just in front of a speaker cap that hides the baked-in eyes and draws
 * Juke's real ones with canvas 2D: bold ink lines, flat colours.
 * Size and position come from the speaker/cap bounding boxes.
 */
export function EyePlate({
  side,
  rig,
  speaker,
  cap,
  capPosition,
  gradientMap,
}: {
  side: Side
  rig: FaceRig
  speaker: THREE.BufferGeometry
  cap: THREE.BufferGeometry
  capPosition: [number, number, number]
  gradientMap: THREE.Texture
}) {
  const { radius, position } = useMemo(() => {
    speaker.computeBoundingBox()
    cap.computeBoundingBox()
    const sb = speaker.boundingBox!
    const cb = cap.boundingBox!
    const center = sb.getCenter(new THREE.Vector3())
    const half = sb.getSize(new THREE.Vector3()).multiplyScalar(0.5)
    const front = Math.max(sb.max.z, capPosition[2] + cb.max.z)
    return {
      radius: Math.min(half.x, half.y) * FACE.plateRadius,
      position: [center.x, center.y, front + FACE.plateOffset] as [number, number, number],
    }
  }, [speaker, cap, capPosition])

  const { canvas, ctx, texture, material } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = FACE.canvasSize
    const ctx = canvas.getContext('2d')!
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const material = new THREE.MeshToonMaterial({
      map: texture,
      gradientMap,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: texture,
      emissiveIntensity: 0.15,
    })
    return { canvas, ctx, texture, material }
  }, [gradientMap])

  useEffect(() => () => {
    texture.dispose()
    material.dispose()
  }, [texture, material])

  let lastKey = ''
  useFrame(({ clock }) => {
    const e = rig.eyes[side]
    const animated = e.shape === 'heart' || e.shape === 'star' || e.shape === 'spiral'
    const key = animated
      ? 'anim'
      : [e.shape, e.openness, e.squint, e.pupilX, e.pupilY, e.pupilScale, e.browAngle].map((v) =>
          typeof v === 'number' ? v.toFixed(3) : v,
        ).join()
    if (key === lastKey && !animated) return
    lastKey = key
    drawEye(ctx, canvas.width, e, side, clock.elapsedTime)
    texture.needsUpdate = true
  })

  return (
    <mesh position={position} material={material}>
      <circleGeometry args={[radius, 48]} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Drawing

const C = FACE.colors

function drawEye(ctx: CanvasRenderingContext2D, S: number, e: EyeFrame, side: Side, t: number) {
  const c = S / 2
  const R = S / 2 - 1
  const r = R * 0.82
  const ink = Math.max(4, S * 0.035)

  ctx.clearRect(0, 0, S, S)
  // Plate (reads as the speaker rim around the eye).
  ctx.fillStyle = C.lid
  circle(ctx, c, c, R)
  ctx.fill()
  ctx.lineWidth = ink * 0.6
  ctx.strokeStyle = C.ink
  circle(ctx, c, c, R - ink * 0.3)
  ctx.stroke()

  const closed = e.openness < 0.05
  if (e.shape === 'happyArc' || e.shape === 'line' || e.shape === 'x' || closed) {
    drawClosed(ctx, c, r, ink, closed && e.shape !== 'happyArc' && e.shape !== 'x' ? 'line' : e.shape)
    return
  }

  // Inner side of the eye: towards the middle of the face.
  const inner = side === 'L' ? 1 : -1

  ctx.save()
  circle(ctx, c, c, r)
  ctx.clip()

  ctx.fillStyle = C.white
  ctx.fillRect(0, 0, S, S)

  // Pupil / iris
  const travel = r * 0.42
  const px = c + e.pupilX * travel
  const py = c - e.pupilY * travel
  const ps = e.pupilScale
  switch (e.shape) {
    case 'heart': {
      const s = r * 0.62 * ps * (1 + 0.07 * Math.sin(t * 9))
      heart(ctx, c + e.pupilX * travel * 0.4, c - e.pupilY * travel * 0.4, s)
      ctx.fillStyle = C.heart
      ctx.fill()
      ctx.lineWidth = ink * 0.8
      ctx.strokeStyle = C.ink
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      circle(ctx, c - s * 0.32, c - s * 0.28, s * 0.12)
      ctx.fill()
      break
    }
    case 'star': {
      const s = r * 0.6 * ps
      star(ctx, c + e.pupilX * travel * 0.4, c - e.pupilY * travel * 0.4, s, s * 0.45, t * 0.8 * inner)
      ctx.fillStyle = C.star
      ctx.fill()
      ctx.lineWidth = ink * 0.8
      ctx.strokeStyle = C.ink
      ctx.stroke()
      break
    }
    case 'spiral': {
      ctx.lineWidth = ink * 0.75
      ctx.strokeStyle = C.ink
      ctx.lineCap = 'round'
      spiral(ctx, c, c, r * 0.85 * Math.min(ps, 1.1), t * 6 * inner)
      ctx.stroke()
      break
    }
    default: {
      const pr = r * 0.4 * ps
      ctx.fillStyle = C.ink
      circle(ctx, px, py, pr)
      ctx.fill()
      ctx.fillStyle = C.white
      circle(ctx, px - pr * 0.35, py - pr * 0.38, pr * 0.28)
      ctx.fill()
      circle(ctx, px + pr * 0.3, py + pr * 0.3, pr * 0.12)
      ctx.fill()
    }
  }

  // Lids. The upper lid tilts with the brow (angry = inner corner down).
  const top = c - r + (1 - e.openness) * 2 * r
  const tiltInner = e.browAngle * r * 0.35
  const tiltOuter = -e.browAngle * r * 0.12
  const xl = c - r - 4
  const xr = c + r + 4
  const yl = top + (inner < 0 ? tiltInner : tiltOuter)
  const yr = top + (inner > 0 ? tiltInner : tiltOuter)
  const sag = r * 0.18 * (1 - e.openness)

  ctx.fillStyle = C.lid
  ctx.beginPath()
  ctx.moveTo(xl, -4)
  ctx.lineTo(xl, yl)
  ctx.quadraticCurveTo(c, (yl + yr) / 2 + sag, xr, yr)
  ctx.lineTo(xr, -4)
  ctx.closePath()
  ctx.fill()

  const bottom = c + r - e.squint * r * 0.9
  const bulge = -r * 0.2 * e.squint
  if (e.squint > 0.01) {
    ctx.beginPath()
    ctx.moveTo(xl, S + 4)
    ctx.lineTo(xl, bottom)
    ctx.quadraticCurveTo(c, bottom + bulge, xr, bottom)
    ctx.lineTo(xr, S + 4)
    ctx.closePath()
    ctx.fill()
  }

  ctx.strokeStyle = C.ink
  ctx.lineWidth = ink
  ctx.lineCap = 'round'
  if (e.openness < 0.98 || Math.abs(e.browAngle) > 0.05) {
    ctx.beginPath()
    ctx.moveTo(xl, yl)
    ctx.quadraticCurveTo(c, (yl + yr) / 2 + sag, xr, yr)
    ctx.stroke()
  }
  if (e.squint > 0.01) {
    ctx.beginPath()
    ctx.moveTo(xl, bottom)
    ctx.quadraticCurveTo(c, bottom + bulge, xr, bottom)
    ctx.stroke()
  }
  ctx.restore()

  // Bold outline of the eye.
  ctx.lineWidth = ink
  ctx.strokeStyle = C.ink
  circle(ctx, c, c, r)
  ctx.stroke()
}

function drawClosed(ctx: CanvasRenderingContext2D, c: number, r: number, ink: number, shape: string) {
  ctx.strokeStyle = C.ink
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = ink * 1.5
  ctx.beginPath()
  if (shape === 'happyArc') {
    // ^ ^
    ctx.moveTo(c - r * 0.62, c + r * 0.22)
    ctx.quadraticCurveTo(c, c - r * 0.75, c + r * 0.62, c + r * 0.22)
  } else if (shape === 'x') {
    const s = r * 0.45
    ctx.moveTo(c - s, c - s)
    ctx.lineTo(c + s, c + s)
    ctx.moveTo(c + s, c - s)
    ctx.lineTo(c - s, c + s)
  } else {
    // Closed lid: a soft downward curve.
    ctx.moveTo(c - r * 0.7, c + r * 0.05)
    ctx.quadraticCurveTo(c, c + r * 0.35, c + r * 0.7, c + r * 0.05)
  }
  ctx.stroke()
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2)
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath()
  ctx.moveTo(x, y + s * 0.75)
  ctx.bezierCurveTo(x - s * 1.1, y + s * 0.05, x - s * 0.75, y - s * 0.85, x, y - s * 0.3)
  ctx.bezierCurveTo(x + s * 0.75, y - s * 0.85, x + s * 1.1, y + s * 0.05, x, y + s * 0.75)
  ctx.closePath()
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, ro: number, ri: number, rot: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? ro : ri
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
}

function spiral(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath()
  const turns = 3
  const steps = 90
  for (let i = 0; i <= steps; i++) {
    const p = i / steps
    const a = rot + p * turns * Math.PI * 2
    ctx.lineTo(x + Math.cos(a) * r * p, y + Math.sin(a) * r * p)
  }
}
