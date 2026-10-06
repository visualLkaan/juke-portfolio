// Turns the raw project files listed in scripts/projects-manifest.json into web assets:
//   public/projects/<slug>/thumb.jpg          DVD cover art (cropped to the cover's aspect)
//   public/projects/<slug>/g<n>.webp (+ -sm)  large gallery images (PDF pages rendered sharp)
//   public/projects/<slug>/film<n>.mp4 + jpg  web-friendly video + poster frame
//   src/data/media.generated.json             gallery list with sizes, read by projects.ts
// usage: npm run import-projects [slug ...]   (needs Python with pymupdf for PDFs)
//        with slugs, only those projects are rebuilt; the rest are kept as they are.
//        --covers: only redo the DVD cover images (keeps galleries and videos).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import sharp from 'sharp'
import ffmpeg from 'ffmpeg-static'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts/projects-manifest.json'), 'utf8'))
const tmp = mkdtempSync(join(tmpdir(), 'juke-import-'))
const COVER = { w: 800, h: 880 } // matches the cover art area when the title sits in the band
const BIG = 2400
const SMALL = 1200

const src = (f) => join(manifest.root, f)
let n = 0
const tmpFile = (ext) => join(tmp, `f${n++}.${ext}`)

/** Any source (pdf / image / video frame) → a local raster file path. */
function raster(entry, width = BIG) {
  if (entry.video) {
    const out = tmpFile('png')
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(entry.time ?? entry.poster ?? 1), '-i', src(entry.video), '-frames:v', '1', out])
    return out
  }
  if (extname(entry.file).toLowerCase() === '.pdf') {
    const out = tmpFile('png')
    execFileSync('python', [join(ROOT, 'scripts/render_pdf.py'), src(entry.file), String(entry.page ?? 0), out, String(width)])
    return out
  }
  return src(entry.file)
}

async function cover(entry, dir) {
  const file = raster(entry, 2000)
  const img = sharp(file)
  const { width, height } = await img.metadata()
  if (entry.fit === 'contain') {
    // Whole image, centred, over a blurred, enlarged copy of itself.
    let bg
    if (entry.fill === 'edge') {
      // Solid background in the image's own corner colour: seamless for flat designs.
      const { data } = await sharp(file).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
      bg = await sharp({ create: { width: COVER.w, height: COVER.h, channels: 3, background: { r: data[0], g: data[1], b: data[2] } } }).png().toBuffer()
    } else {
      bg = await sharp(file).resize(COVER.w, COVER.h, { fit: 'cover' }).blur(40).modulate({ brightness: 0.9 }).toBuffer()
    }
    const fg = await sharp(file).resize(COVER.w, COVER.h, { fit: 'inside' }).toBuffer()
    const fm = await sharp(fg).metadata()
    await sharp(bg)
      .composite([{ input: fg, left: Math.round((COVER.w - fm.width) / 2), top: Math.round((COVER.h - fm.height) / 2) }])
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(join(dir, 'thumb.jpg'))
    return
  }
  const [x0, y0, x1, y1] = entry.crop ?? [0, 0, 1, 1]
  // Largest box at the cover's aspect inside the crop region, centred on it.
  const bw = (x1 - x0) * width
  const bh = (y1 - y0) * height
  const aspect = COVER.w / COVER.h
  const w = Math.round(Math.min(bw, bh * aspect))
  const h = Math.round(w / aspect)
  const left = Math.round(Math.max(0, Math.min(width - w, x0 * width + (bw - w) / 2)))
  const top = Math.round(Math.max(0, Math.min(height - h, y0 * height + (bh - h) / 2)))
  await sharp(file).extract({ left, top, width: w, height: h }).resize(COVER.w, COVER.h).modulate({ brightness: entry.brightness ?? 1 }).jpeg({ quality: 88, mozjpeg: true }).toFile(join(dir, 'thumb.jpg'))
}

async function image(entry, dir, i) {
  const file = raster(entry)
  const meta = await sharp(file).metadata()
  const w = Math.min(BIG, meta.width)
  const big = `g${i}.webp`
  const small = `g${i}-sm.webp`
  const info = await sharp(file).resize({ width: w }).webp({ quality: 84 }).toFile(join(dir, big))
  await sharp(file).resize({ width: Math.min(SMALL, meta.width) }).webp({ quality: 80 }).toFile(join(dir, small))
  return { type: 'image', src: big, small, width: info.width, height: info.height, caption: entry.caption ?? '' }
}

async function video(entry, dir, i) {
  const name = `film${i}.mp4`
  const poster = `film${i}.jpg`
  execFileSync(ffmpeg, [
    '-v', 'error', '-y', '-i', src(entry.video),
    '-vf', "scale='min(1920,iw)':-2", '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-maxrate', '3M', '-bufsize', '6M', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', join(dir, name),
  ])
  const frame = raster({ video: entry.video, time: entry.poster ?? 1 })
  const info = await sharp(frame).resize({ width: 1600 }).jpeg({ quality: 84, mozjpeg: true }).toFile(join(dir, poster))
  return { type: 'video', src: name, poster, width: info.width, height: info.height, caption: entry.caption ?? '' }
}

const coversOnly = process.argv.includes('--covers')
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const mediaFile = join(ROOT, 'src/data/media.generated.json')
const media = (only.length || coversOnly) && existsSync(mediaFile) ? JSON.parse(readFileSync(mediaFile, 'utf8')) : {}
for (const p of manifest.projects) {
  if (only.length && !only.includes(p.slug)) continue
  const dir = join(ROOT, 'public/projects', p.slug)
  if (coversOnly) {
    mkdirSync(dir, { recursive: true })
    await cover(p.cover, dir)
    console.log(`✓ ${p.slug}: cover`)
    continue
  }
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  await cover(p.cover, dir)
  const gallery = []
  let gi = 1
  for (const entry of p.gallery) gallery.push(entry.video ? await video(entry, dir, gi++) : await image(entry, dir, gi++))
  // Paths as the site sees them.
  media[p.slug] = gallery.map((g) => ({
    ...g,
    src: `/projects/${p.slug}/${g.src}`,
    ...(g.small && { small: `/projects/${p.slug}/${g.small}` }),
    ...(g.poster && { poster: `/projects/${p.slug}/${g.poster}` }),
  }))
  console.log(`✓ ${p.slug}: cover + ${gallery.length} item(s)`)
}
writeFileSync(join(ROOT, 'src/data/media.generated.json'), JSON.stringify(media, null, 2) + '\n')
if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
console.log('Wrote src/data/media.generated.json')
