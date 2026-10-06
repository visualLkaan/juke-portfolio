// Pre-softens the background's black/white masks and packs them into two RGB images,
// so the browser doesn't process millions of pixels on every visit:
//   public/bg/fx-a.png = R sun, G lamp, B fishbowl   (edges softened)
//   public/bg/fx-b.png = R depth (smoothed), G lamp glow (wide), B pennants
// usage: npm run bake-masks   (re-run after changing any mask or the depth map)
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const BG = new URL('../public/bg/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const { width: W, height: H } = await sharp(join(BG, 'room.jpg')).metadata()

/** One grey channel, blurred by `sigma` px (0 = as is). Missing file → black + warning. */
async function channel(file, sigma) {
  const path = join(BG, file)
  if (!existsSync(path)) {
    console.warn(`⚠ ${file} is missing — that effect will be off.`)
    return Buffer.alloc(W * H)
  }
  let img = sharp(path).resize(W, H, { fit: 'fill' }).greyscale()
  if (sigma > 0) img = img.blur(sigma)
  return img.raw().toBuffer()
}

async function pack(out, chans) {
  const [r, g, b] = await Promise.all(chans.map(([f, s]) => channel(f, s)))
  const data = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    data[i * 3] = r[i]
    data[i * 3 + 1] = g[i]
    data[i * 3 + 2] = b[i]
  }
  await sharp(data, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toFile(join(BG, out))
  console.log(`✓ ${out}`)
}

await pack('fx-a.png', [['mask_sun.png', 2.5], ['mask_lamp.png', 2], ['mask_fishbowl.png', 2]])
await pack('fx-b.png', [['depth.png', 3], ['mask_lamp.png', 28], ['mask_pennant.png', 2]])
