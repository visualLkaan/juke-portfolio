import * as THREE from 'three'
import type { Project } from '../data/projects'
import { CANVAS, CASE } from './config'

/*
 * Every face of a DVD is drawn here from project data alone: front cover, spine,
 * back cover, disc print and the case's inside. Nothing is designed by hand.
 * Faces are drawn straight away (placeholder art, fallback fonts) and redrawn once
 * the web fonts and the project's images have loaded.
 */

type Ctx = CanvasRenderingContext2D
type Img = HTMLImageElement | null

export type CoverSet = {
  front: THREE.CanvasTexture
  spine: THREE.CanvasTexture
  back: THREE.CanvasTexture
  disc: THREE.CanvasTexture
  discIri: THREE.CanvasTexture
  inner: THREE.CanvasTexture
  dispose: () => void
}

export function createCoverSet(p: Project): CoverSet {
  const [fw, fh] = CANVAS.front
  const [sw, sh] = CANVAS.spine
  const [iw, ih] = CANVAS.inner
  const c = {
    front: canvas(fw, fh),
    spine: canvas(sw, sh),
    back: canvas(fw, fh),
    disc: canvas(CANVAS.disc, CANVAS.disc),
    discIri: canvas(256, 256),
    inner: canvas(iw, ih),
  }
  const tex = Object.fromEntries(
    Object.entries(c).map(([k, cv]) => {
      const t = new THREE.CanvasTexture(cv)
      // The iridescence mask is data, not colour.
      if (k !== 'discIri') t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      return [k, t]
    }),
  ) as Record<keyof typeof c, THREE.CanvasTexture>

  // Drawn once, after fonts and images are in, one face per task so the page never
  // stalls (and each texture uploads on its own frame).
  coverLoading.pending++
  ;(async () => {
    const [, thumb, shots] = await Promise.all([
      fontsReady(),
      loadImage(p.thumbnail),
      Promise.all((p.screenshots ?? []).slice(0, 3).map(loadImage)),
    ])
    const steps: [keyof typeof c, () => void][] = [
      ['front', () => drawFront(ctx(c.front), p, thumb)],
      ['spine', () => drawSpine(ctx(c.spine), p)],
      ['disc', () => drawDisc(ctx(c.disc), p, thumb)],
      ['discIri', () => drawDiscIridescence(ctx(c.discIri))],
      ['inner', () => drawInner(ctx(c.inner))],
      ['back', () => drawBack(ctx(c.back), p, thumb, shots)],
    ]
    for (const [key, draw] of steps) {
      await nextTask()
      draw()
      tex[key].needsUpdate = true
    }
  })()
    .catch((e) => console.error(`[Juke] cover for "${p.slug}" failed to draw`, e))
    .finally(() => coverLoading.pending--)

  return {
    ...tex,
    // Only frees GPU memory: drawing may still finish afterwards (React's StrictMode
    // disposes and reuses a set once in dev, so drawing must not depend on it).
    dispose: () => {
      for (const t of Object.values(tex)) t.dispose()
    },
  }
}

// --- Loading -----------------------------------------------------------------

/** How many cover sets are still drawing (the intro waits for them). */
export const coverLoading = { pending: 0 }

const nextTask = () => new Promise<void>((r) => setTimeout(r, 0))

let fonts: Promise<void> | null = null
function fontsReady() {
  fonts ??= Promise.race([
    Promise.all([
      document.fonts.load(`80px ${CANVAS.titleFont}`),
      document.fonts.load(`800 24px ${CANVAS.bodyFont}`),
    ]).then(() => undefined),
    new Promise<void>((r) => setTimeout(r, 4000)),
  ]).catch(() => undefined)
  return fonts
}

/** Never rejects: a missing or broken image just resolves to null. */
function loadImage(src?: string): Promise<Img> {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// --- Helpers -----------------------------------------------------------------

function canvas(w: number, h: number) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return cv
}

function ctx(cv: HTMLCanvasElement) {
  const g = cv.getContext('2d')!
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, cv.width, cv.height)
  g.textBaseline = 'alphabetic'
  return g
}

function hashString(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Small seeded RNG so a project's placeholder art is always the same. */
function rng(seed: string) {
  let a = hashString(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const col = (hex: string) => new THREE.Color(hex)
function shade(hex: string, dl: number, dh = 0, ds = 0) {
  const hsl = { h: 0, s: 0, l: 0 }
  col(hex).getHSL(hsl)
  return '#' + new THREE.Color().setHSL((hsl.h + dh + 1) % 1, clamp01(hsl.s + ds), clamp01(hsl.l + dl)).getHexString()
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
function luminance(hex: string) {
  const c = col(hex) // linear-space components
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}
const isLight = (hex: string) => luminance(hex) > 0.36

/** Title colour that pops on the project colour: yellow on dark, a deep hue shift on light. */
function titleColor(hex: string) {
  return isLight(hex) ? shade(hex, -0.2, -0.11, 0.1) : '#ffd84a'
}

function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

function coverImage(g: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const iw = img.naturalWidth * s
  const ih = img.naturalHeight * s
  g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
}

function emoji(g: Ctx, icon: string, x: number, y: number, size: number) {
  g.save()
  g.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(icon, x, y + size * 0.05)
  g.restore()
}

/** Splits text into at most `maxLines` lines that fit `width`; the last line is ellipsised. */
function wrap(g: Ctx, text: string, width: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (g.measureText(next).width <= width || !line) {
      line = next
      continue
    }
    lines.push(line)
    line = words[i]
    if (lines.length === maxLines) {
      line = ''
      // Out of room: ellipsise the last line.
      let last = lines[maxLines - 1] + '…'
      while (g.measureText(last).width > width && last.length > 1) last = last.slice(0, -2) + '…'
      lines[maxLines - 1] = last
      break
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Biggest title layout (1 or 2 lines) that fits the box. Long names shrink or wrap.
 */
function fitTitle(g: Ctx, text: string, width: number, height: number, maxSize: number, minSize = 28) {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean)
  for (let size = maxSize; size >= minSize; size -= 2) {
    g.font = `${size}px ${CANVAS.titleFont}`
    const lh = size * 0.92
    const one = words.join(' ')
    if (g.measureText(one).width <= width && size <= height) return { size, lines: [one], lh }
    if (words.length > 1 && lh * 2 <= height) {
      // Most balanced split.
      let best: string[] | null = null
      let bestW = Infinity
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' ')
        const b = words.slice(i).join(' ')
        const w = Math.max(g.measureText(a).width, g.measureText(b).width)
        if (w < bestW) (bestW = w), (best = [a, b])
      }
      if (best && bestW <= width) return { size, lines: best, lh }
    }
  }
  // Still too long: squeeze the single line horizontally.
  g.font = `${minSize}px ${CANVAS.titleFont}`
  return { size: minSize, lines: [words.join(' ')], lh: minSize * 0.92, squeeze: true }
}

function drawTitle(
  g: Ctx,
  text: string,
  cx: number,
  top: number,
  width: number,
  height: number,
  maxSize: number,
  fill: string,
  opts: { angle?: number; stroke?: number } = {},
) {
  const t = fitTitle(g, text, width, height, maxSize)
  g.save()
  g.translate(cx, top + (t.lines.length * t.lh) / 2)
  g.rotate(opts.angle ?? -0.08)
  g.font = `${t.size}px ${CANVAS.titleFont}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  const y0 = -((t.lines.length - 1) * t.lh) / 2
  t.lines.forEach((line, i) => {
    const y = y0 + i * t.lh
    const w = g.measureText(line).width
    const sx = t.squeeze && w > width ? width / w : 1
    g.save()
    g.scale(sx, 1)
    // Chunky drop shadow + outline, like a kids' movie logo.
    g.fillStyle = 'rgba(20,10,40,0.55)'
    g.fillText(line, t.size * 0.05, y + t.size * 0.07)
    g.lineWidth = opts.stroke ?? t.size * 0.12
    g.strokeStyle = '#1a1030'
    g.strokeText(line, 0, y)
    g.fillStyle = fill
    g.fillText(line, 0, y)
    g.restore()
  })
  g.restore()
}

/** Stylised "DVD" mark with a disc swoosh. */
function dvdLogo(g: Ctx, x: number, y: number, h: number, color: string) {
  g.save()
  g.translate(x, y)
  g.fillStyle = color
  g.font = `italic 900 ${h}px "Arial Black", "Segoe UI", sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  g.fillText('DVD', 0, 0)
  g.beginPath()
  g.ellipse(0, h * 0.32, h * 1.25, h * 0.22, 0, 0, Math.PI * 2)
  g.fill()
  g.globalCompositeOperation = 'destination-out'
  g.beginPath()
  g.ellipse(0, h * 0.32, h * 0.32, h * 0.08, 0, 0, Math.PI * 2)
  g.fill()
  g.restore()
}

/** Case plastic: near-black with a soft sheen and a few moulding lines. */
function plastic(g: Ctx, w: number, h: number) {
  const grd = g.createLinearGradient(0, 0, w, h)
  grd.addColorStop(0, shade(CASE.plastic, 0.05))
  grd.addColorStop(0.5, CASE.plastic)
  grd.addColorStop(1, shade(CASE.plastic, -0.03))
  g.fillStyle = grd
  g.fillRect(0, 0, w, h)
}

// --- Placeholder art -----------------------------------------------------------

type Theme = 'space' | 'city' | 'ocean' | 'forest' | 'bubbles' | 'sunburst'
const THEMES: Theme[] = ['space', 'city', 'ocean', 'forest', 'bubbles', 'sunburst']

function themeOf(p: Project): Theme {
  const s = `${p.title} ${p.tagline}`.toLowerCase()
  if (/pizza|food|cake|cook|burger|candy shop/.test(s)) return 'sunburst'
  if (/space|planet|star|rocket|moon|galaxy|alien/.test(s)) return 'space'
  if (/ocean|sea|fish|water|dive|surf|boat/.test(s)) return 'ocean'
  if (/night|city|race|car|neon|street/.test(s)) return 'city'
  if (/camp|forest|monster|tree|wood|hike/.test(s)) return 'forest'
  if (/bubble|cloud|sky|dream|float/.test(s)) return 'bubbles'
  return THEMES[hashString(p.slug) % THEMES.length]
}

function star(g: Ctx, x: number, y: number, r: number) {
  g.beginPath()
  g.moveTo(x, y - r)
  g.quadraticCurveTo(x, y, x + r, y)
  g.quadraticCurveTo(x, y, x, y + r)
  g.quadraticCurveTo(x, y, x - r, y)
  g.quadraticCurveTo(x, y, x, y - r)
  g.fill()
}

/** A simple, colourful illustration standing in for a missing thumbnail. */
function drawPlaceholder(g: Ctx, p: Project, x: number, y: number, w: number, h: number) {
  const r = rng(p.slug)
  const theme = themeOf(p)
  const base = p.color
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()

  const sky = g.createLinearGradient(0, y, 0, y + h)
  sky.addColorStop(0, shade(base, theme === 'city' ? -0.12 : 0.1))
  sky.addColorStop(1, shade(base, theme === 'city' ? 0.05 : -0.08))
  g.fillStyle = sky
  g.fillRect(x, y, w, h)

  const light = (a: number) => `rgba(255,255,255,${a})`
  const dark = shade(base, -0.22)

  switch (theme) {
    case 'space': {
      g.fillStyle = '#fff6c8'
      for (let i = 0; i < 26; i++) star(g, x + r() * w, y + r() * h * 0.8, 3 + r() * 9)
      // Planet in the corner.
      const px = x + w * 0.08
      const py = y + h * 0.98
      g.fillStyle = '#3aa0e8'
      g.beginPath()
      g.arc(px, py, w * 0.36, 0, Math.PI * 2)
      g.fill()
      g.save()
      g.clip()
      g.fillStyle = '#5ccf6a'
      for (let i = 0; i < 5; i++) {
        g.beginPath()
        g.ellipse(px - w * 0.2 + r() * w * 0.4, py - w * 0.3 + r() * w * 0.3, w * (0.05 + r() * 0.07), w * 0.04, r() * 3, 0, Math.PI * 2)
        g.fill()
      }
      g.restore()
      g.fillStyle = '#ff9a5c'
      g.beginPath()
      g.arc(x + w * 0.84, y + h * 0.72, w * 0.05, 0, Math.PI * 2)
      g.fill()
      break
    }
    case 'city': {
      g.fillStyle = '#ffe9a8'
      g.beginPath()
      g.arc(x + w * 0.25, y + h * 0.28, w * 0.09, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = shade(base, -0.05)
      g.beginPath()
      g.arc(x + w * 0.29, y + h * 0.25, w * 0.08, 0, Math.PI * 2)
      g.fill()
      // Neon glow stripes.
      for (const [c, yy] of [['#ff4f8b', 0.5], ['#ffb03a', 0.56]] as const) {
        g.fillStyle = c
        g.globalAlpha = 0.55
        g.fillRect(x, y + h * yy, w, h * 0.03)
      }
      g.globalAlpha = 1
      let bx = x
      while (bx < x + w) {
        const bw = w * (0.08 + r() * 0.1)
        const bh = h * (0.2 + r() * 0.35)
        g.fillStyle = shade(base, -0.18 + r() * 0.06)
        g.fillRect(bx, y + h - bh, bw - 3, bh)
        g.fillStyle = '#ffd36a'
        for (let wy = y + h - bh + 10; wy < y + h - 10; wy += 16)
          for (let wx = bx + 6; wx < bx + bw - 10; wx += 12) if (r() < 0.35) g.fillRect(wx, wy, 5, 7)
        bx += bw
      }
      break
    }
    case 'ocean': {
      g.fillStyle = light(0.12)
      for (let i = 0; i < 4; i++) {
        g.beginPath()
        const sx = x + w * (0.1 + i * 0.25)
        g.moveTo(sx, y)
        g.lineTo(sx + w * 0.12, y)
        g.lineTo(sx + w * 0.02, y + h)
        g.lineTo(sx - w * 0.1, y + h)
        g.fill()
      }
      for (let i = 0; i < 6; i++) {
        const fx = x + r() * w
        const fy = y + h * (0.25 + r() * 0.6)
        const fs = w * (0.03 + r() * 0.025)
        g.fillStyle = ['#ffb03a', '#ff6f5c', '#ffd84a'][i % 3]
        g.beginPath()
        g.ellipse(fx, fy, fs, fs * 0.6, 0, 0, Math.PI * 2)
        g.moveTo(fx + fs * 0.8, fy)
        g.lineTo(fx + fs * 1.6, fy - fs * 0.6)
        g.lineTo(fx + fs * 1.6, fy + fs * 0.6)
        g.fill()
      }
      g.strokeStyle = light(0.7)
      g.lineWidth = 3
      for (let i = 0; i < 9; i++) {
        g.beginPath()
        g.arc(x + r() * w, y + r() * h, 4 + r() * 10, 0, Math.PI * 2)
        g.stroke()
      }
      break
    }
    case 'forest': {
      g.fillStyle = shade(base, -0.12)
      g.beginPath()
      g.ellipse(x + w * 0.5, y + h * 1.05, w * 0.8, h * 0.3, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = dark
      for (let i = 0; i < 7; i++) {
        const tx = x + (i / 6) * w + (r() - 0.5) * 30
        const th = h * (0.35 + r() * 0.25)
        const tw = w * 0.12
        g.beginPath()
        g.moveTo(tx, y + h - th)
        g.lineTo(tx + tw, y + h)
        g.lineTo(tx - tw, y + h)
        g.fill()
      }
      g.fillStyle = light(0.8)
      for (let i = 0; i < 10; i++) star(g, x + r() * w, y + r() * h * 0.4, 2 + r() * 4)
      break
    }
    case 'bubbles': {
      g.fillStyle = light(0.75)
      for (let i = 0; i < 4; i++) {
        const cx = x + r() * w
        const cy = y + h * (0.6 + r() * 0.45)
        for (let k = 0; k < 4; k++) {
          g.beginPath()
          g.arc(cx + (k - 1.5) * w * 0.08, cy - (k % 2) * h * 0.04, w * 0.09, 0, Math.PI * 2)
          g.fill()
        }
      }
      for (let i = 0; i < 9; i++) {
        const bx = x + r() * w
        const by = y + r() * h * 0.7
        const br = 8 + r() * 22
        g.fillStyle = 'rgba(140,200,255,0.55)'
        g.beginPath()
        g.arc(bx, by, br, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = light(0.9)
        g.beginPath()
        g.arc(bx - br * 0.35, by - br * 0.35, br * 0.25, 0, Math.PI * 2)
        g.fill()
      }
      break
    }
    case 'sunburst': {
      g.save()
      g.translate(x + w / 2, y + h * 0.62)
      g.fillStyle = light(0.18)
      for (let i = 0; i < 16; i += 2) {
        g.beginPath()
        g.moveTo(0, 0)
        g.arc(0, 0, w * 1.2, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2)
        g.fill()
      }
      g.restore()
      g.fillStyle = shade(base, -0.3, -0.05)
      g.beginPath()
      g.moveTo(x, y + h)
      for (let i = 0; i <= 8; i++) g.lineTo(x + (i / 8) * w, y + h * (0.8 + (i % 2) * 0.06 + r() * 0.04))
      g.lineTo(x + w, y + h)
      g.fill()
      break
    }
  }

  // The "hero": the project's icon, big, with a soft glow behind it.
  const hx = x + w * 0.55
  const hy = y + h * 0.62
  const hs = Math.min(w, h) * 0.42
  const glow = g.createRadialGradient(hx, hy, hs * 0.1, hx, hy, hs * 0.85)
  glow.addColorStop(0, light(0.65))
  glow.addColorStop(1, light(0))
  g.fillStyle = glow
  g.fillRect(hx - hs, hy - hs, hs * 2, hs * 2)
  g.shadowColor = 'rgba(0,0,0,0.35)'
  g.shadowBlur = hs * 0.08
  g.shadowOffsetY = hs * 0.04
  emoji(g, p.icon, hx, hy, hs)
  g.restore()
}

function drawArt(g: Ctx, p: Project, img: Img, x: number, y: number, w: number, h: number) {
  if (!img) return drawPlaceholder(g, p, x, y, w, h)
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  coverImage(g, img, x, y, w, h)
  g.restore()
}

// --- Faces ---------------------------------------------------------------------

/** Front cover layout in canvas px (shared with the case geometry's hinge ridge). */
export const FRONT = { left: 46, right: 26, top: 24, bottom: 132, frame: 18, band: 150 }

function drawFront(g: Ctx, p: Project, thumb: Img) {
  const [W, H] = CANVAS.front
  plastic(g, W, H)

  // Hinge ridge shading on the left and the moulded lines along the bottom.
  const ridge = g.createLinearGradient(0, 0, FRONT.left, 0)
  ridge.addColorStop(0, 'rgba(255,255,255,0.02)')
  ridge.addColorStop(0.45, 'rgba(255,255,255,0.12)')
  ridge.addColorStop(1, 'rgba(0,0,0,0.25)')
  g.fillStyle = ridge
  g.fillRect(0, 0, FRONT.left, H)
  for (let i = 0; i < 4; i++) {
    const y = H - FRONT.bottom + 38 + i * 22
    g.fillStyle = 'rgba(0,0,0,0.45)'
    g.fillRect(FRONT.left + 10, y, W - FRONT.left - FRONT.right - 20, 4)
    g.fillStyle = 'rgba(255,255,255,0.07)'
    g.fillRect(FRONT.left + 10, y + 4, W - FRONT.left - FRONT.right - 20, 2)
  }

  // Coloured sleeve.
  const cx = FRONT.left
  const cy = FRONT.top
  const cw = W - FRONT.left - FRONT.right
  const ch = H - FRONT.top - FRONT.bottom
  g.fillStyle = p.color
  roundRect(g, cx, cy, cw, ch, 10)
  g.fill()

  const f = FRONT.frame
  const bandH = FRONT.band
  const ax = cx + f
  const ay = cy + f
  const aw = cw - f * 2
  const ah = ch - f - bandH
  drawArt(g, p, thumb, ax, ay, aw, ah)
  g.strokeStyle = 'rgba(0,0,0,0.25)'
  g.lineWidth = 3
  g.strokeRect(ax, ay, aw, ah)

  const artTitle = p.coverTitle !== false
  if (artTitle) drawTitle(g, p.title, ax + aw / 2, ay + 22, aw - 50, ah * 0.46, 118, titleColor(p.color))

  // Bottom band: icon badge, two-line tagline, DVD mark.
  const by = ay + ah
  const band = isLight(p.color) ? shade(p.color, -0.06) : shade(p.color, 0.08)
  g.fillStyle = band
  g.fillRect(ax, by, aw, bandH - f)
  const ink = isLight(band) ? '#1a1030' : '#ffffff'

  const bs = 92
  const bx = ax + 16
  const bdy = by + (bandH - f - bs) / 2
  g.fillStyle = '#fffaf0'
  roundRect(g, bx, bdy, bs, bs, 18)
  g.fill()
  g.strokeStyle = 'rgba(0,0,0,0.2)'
  g.lineWidth = 3
  g.stroke()
  emoji(g, p.icon, bx + bs / 2, bdy + bs / 2, bs * 0.62)

  const tx = bx + bs + 20
  const tw = ax + aw - tx - 16
  g.fillStyle = ink
  g.textAlign = 'left'
  if (artTitle) {
    g.font = `800 27px ${CANVAS.bodyFont}`
    const lines = wrap(g, p.tagline, tw, 2)
    lines.forEach((l, i) => g.fillText(l, tx, bdy + 30 + i * 32))
  } else {
    // The art has its own title: name the project here, tagline under it.
    let size = 40
    g.font = `${size}px ${CANVAS.titleFont}`
    while (g.measureText(p.title.toUpperCase()).width > tw && size > 22) g.font = `${(size -= 2)}px ${CANVAS.titleFont}`
    g.fillText(p.title.toUpperCase(), tx, bdy + 36)
    g.font = `800 21px ${CANVAS.bodyFont}`
    wrap(g, p.tagline, tw - 70, 2).forEach((l, i) => g.fillText(l, tx, bdy + 66 + i * 24))
  }
  dvdLogo(g, ax + aw - 52, by + bandH - f - 26, 24, ink)
}

function drawSpine(g: Ctx, p: Project) {
  const [W, H] = CANVAS.spine
  plastic(g, W, H)
  const m = 10
  const top = 26
  const bottom = 26
  g.fillStyle = p.color
  roundRect(g, m, top, W - m * 2, H - top - bottom, 8)
  g.fill()
  const ink = isLight(p.color) ? '#1a1030' : '#ffffff'

  // Icon at the top in a little disc.
  g.fillStyle = '#fffaf0'
  g.beginPath()
  g.arc(W / 2, top + 50, 32, 0, Math.PI * 2)
  g.fill()
  emoji(g, p.icon, W / 2, top + 50, 40)

  // Vertical title (reads top to bottom).
  g.save()
  g.translate(W / 2, H / 2 + 10)
  g.rotate(Math.PI / 2)
  drawTitle(g, p.title, 0, -38, H - 300, 72, 64, titleColor(p.color), { angle: 0, stroke: 8 })
  g.restore()

  g.save()
  g.translate(W / 2, H - bottom - 48)
  dvdLogo(g, 0, 0, 22, ink)
  g.restore()
}

function drawBack(g: Ctx, p: Project, thumb: Img, shots: Img[]) {
  const [W, H] = CANVAS.front
  plastic(g, W, H)
  const m = { l: FRONT.right, r: FRONT.left, t: FRONT.top, b: 60 }
  const x = m.l
  const y = m.t
  const w = W - m.l - m.r
  const h = H - m.t - m.b
  g.fillStyle = p.color
  roundRect(g, x, y, w, h, 10)
  g.fill()
  const ink = isLight(p.color) ? '#1a1030' : '#ffffff'
  const pad = 22

  // Hero image.
  const ih = h * 0.3
  drawArt(g, p, thumb, x + pad, y + pad, w - pad * 2, ih)
  g.strokeStyle = 'rgba(0,0,0,0.25)'
  g.lineWidth = 3
  g.strokeRect(x + pad, y + pad, w - pad * 2, ih)

  let cy = y + pad + ih + 22
  drawTitle(g, p.title, x + w / 2, cy, w - pad * 2, 64, 60, titleColor(p.color), { angle: 0, stroke: 7 })
  cy += 92

  const hasShots = shots.some(Boolean)
  g.font = `700 23px ${CANVAS.bodyFont}`
  g.fillStyle = ink
  g.textAlign = 'left'
  const lines = wrap(g, p.description, w - pad * 2, hasShots ? 6 : 9)
  lines.forEach((l, i) => g.fillText(l, x + pad, cy + i * 30))
  cy += lines.length * 30 + 14

  // Tech chips.
  g.font = `800 19px ${CANVAS.bodyFont}`
  let chipX = x + pad
  for (const t of p.tech) {
    const tw = g.measureText(t).width + 24
    if (chipX + tw > x + w - pad) break
    g.fillStyle = isLight(p.color) ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.2)'
    roundRect(g, chipX, cy, tw, 32, 16)
    g.fill()
    g.fillStyle = ink
    g.fillText(t, chipX + 12, cy + 23)
    chipX += tw + 10
  }
  cy += 50

  // Up to three screenshots.
  if (hasShots) {
    const gap = 12
    const sw = (w - pad * 2 - gap * 2) / 3
    const sh = sw * 0.66
    shots.slice(0, 3).forEach((s, i) => {
      if (!s) return
      const sx = x + pad + i * (sw + gap)
      g.save()
      roundRect(g, sx, cy, sw, sh, 8)
      g.clip()
      coverImage(g, s, sx, cy, sw, sh)
      g.restore()
    })
  }

  // Barcode.
  const bw = 150
  const bh = 74
  const bx = x + w - pad - bw
  const by = y + h - pad - bh
  g.fillStyle = '#ffffff'
  g.fillRect(bx, by, bw, bh)
  const r = rng(p.slug + 'barcode')
  g.fillStyle = '#111111'
  for (let bxi = bx + 10; bxi < bx + bw - 12; ) {
    const lw = 1 + Math.floor(r() * 4)
    g.fillRect(bxi, by + 8, lw, bh - 30)
    bxi += lw + 1 + Math.floor(r() * 3)
  }
  g.font = `700 13px monospace`
  g.textAlign = 'center'
  g.fillText(String(hashString(p.slug)).padStart(12, '0').slice(0, 12), bx + bw / 2, by + bh - 8)
  dvdLogo(g, x + pad + 40, y + h - pad - 22, 24, ink)
}

function drawDisc(g: Ctx, p: Project, thumb: Img) {
  const S = CANVAS.disc
  const c = S / 2
  const R = c - 2
  g.save()
  g.beginPath()
  g.arc(c, c, R, 0, Math.PI * 2)
  g.clip()
  drawArt(g, p, thumb, 0, 0, S, S)
  if (p.coverTitle !== false) drawTitle(g, p.title, c - 30, S * 0.12, S * 0.62, S * 0.3, 80, titleColor(p.color))
  dvdLogo(g, c + R * 0.42, c + R * 0.72, 22, '#ffffff')
  g.restore()

  // Silver rim.
  g.lineWidth = R * 0.05
  g.strokeStyle = 'rgba(225,230,238,0.95)'
  g.beginPath()
  g.arc(c, c, R - g.lineWidth / 2, 0, Math.PI * 2)
  g.stroke()

  // Clear hub ring around the hole, then the hole itself.
  const hub = R * 0.27
  const hole = R * 0.1
  g.globalCompositeOperation = 'destination-out'
  g.beginPath()
  g.arc(c, c, hub, 0, Math.PI * 2)
  g.fill()
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = 'rgba(215,225,235,0.45)'
  g.beginPath()
  g.arc(c, c, hub, 0, Math.PI * 2)
  g.arc(c, c, hole, 0, Math.PI * 2, true)
  g.fill()
  g.strokeStyle = 'rgba(240,244,250,0.9)'
  g.lineWidth = 5
  g.beginPath()
  g.arc(c, c, hub * 0.72, 0, Math.PI * 2)
  g.stroke()
}

/** Where the rainbow sheen shows: strong on the rim and the clear hub, faint on the print. */
function drawDiscIridescence(g: Ctx) {
  const S = 256
  const c = S / 2
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  g.fillStyle = 'rgb(255,255,255)'
  g.beginPath()
  g.arc(c, c, c, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgb(70,70,70)'
  g.beginPath()
  g.arc(c, c, c * 0.93, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgb(255,255,255)'
  g.beginPath()
  g.arc(c, c, c * 0.29, 0, Math.PI * 2)
  g.fill()
}

/** Inside of the case: grey plastic with a moulded border and clip tabs. */
function drawInner(g: Ctx) {
  const [W, H] = CANVAS.inner
  g.fillStyle = CASE.inner
  g.fillRect(0, 0, W, H)
  g.strokeStyle = 'rgba(255,255,255,0.08)'
  g.lineWidth = 4
  roundRect(g, 14, 14, W - 28, H - 28, 10)
  g.stroke()
  g.fillStyle = 'rgba(0,0,0,0.3)'
  for (const y of [H * 0.15, H * 0.85]) {
    roundRect(g, W - 30, y - 18, 10, 36, 4)
    g.fill()
  }
}

/** The finished front cover as an image URL (for the project page). */
export async function renderFrontCover(p: Project): Promise<string> {
  const [w, h] = CANVAS.front
  const cv = canvas(w, h)
  const [, thumb] = await Promise.all([fontsReady(), loadImage(p.thumbnail)])
  drawFront(ctx(cv), p, thumb)
  return cv.toDataURL('image/png')
}

/** The cover art alone (thumbnail or placeholder), square, as an image URL. */
export async function renderArt(p: Project, size = 800): Promise<string> {
  const cv = canvas(size, size)
  const thumb = await loadImage(p.thumbnail)
  drawArt(ctx(cv), p, thumb, 0, 0, size, size)
  return cv.toDataURL('image/jpeg', 0.9)
}
