// Dev-only headless test helper (Edge + CDP). Steps run in order, one screenshot each, tiled into a grid.
// usage: node scripts/dev/seq.mjs <url> <out.png> <w> <h> <waitMs> <steps> [crop: left,top,width,height]
// steps are separated by "," (or ";;" when a step contains commas):
//   <expression>        set a Juke expression, e.g. love
//   js:<code>           evaluate in the page (non-zero results are printed)
//   mouse:x:y           move the mouse     click:x:y[:times]   click
// env STEP=ms sets the wait after each step (default 1100). Dev globals: __juke, __director, __scene, __cam.
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const sharp = createRequire(new URL('../../package.json', import.meta.url))('sharp')

const [url, out, w, h, wait, list, cropArg = '150,230,700,380'] = process.argv.slice(2)
const [cl, ct, cw, ch] = cropArg.split(',').map(Number)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const port = 9333 + Math.floor(Math.random() * 500)
const proc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'edgeprof-'))}`,
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', '--no-first-run', '--disable-extensions', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
const logs = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('[error] ' + m.params.args.map((a) => a.value ?? a.description).join(' '))
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
await sleep(+wait)

const tiles = []
const T0 = Date.now()
for (const n of list.split(list.includes(';;') ? ';;' : ',')) {
  if (n.startsWith('click:')) {
    const [x, y, times = 1] = n.slice(6).split(':').map(Number)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    for (let k = 0; k < times; k++) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
      await sleep(120)
    }
  }
  if (n.startsWith('mouse:')) {
    const [x, y] = n.slice(6).split(':').map(Number)
    for (let i = 0; i < 6; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + i, y })
  }
  const js = n.startsWith('mouse:') || n.startsWith('click:') ? '0' : n.startsWith('js:') ? n.slice(3) : `window.__juke.getState().setExpression('${n}')`
  const ev = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true })
  if (n.startsWith('js:') && ev.result?.result?.value !== undefined && ev.result.result.value !== 0) logs.push('result: ' + JSON.stringify(ev.result.result.value))
  await sleep(+(process.env.STEP || 1100))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const label = (n.startsWith('js:') ? 'js' : n) + ' @' + ((Date.now() - T0) / 1000).toFixed(1) + 's'
  const svg = Buffer.from(`<svg width="400" height="34"><rect width="400" height="34" fill="black"/><text x="8" y="25" font-size="22" fill="white" font-family="sans-serif">${label}</text></svg>`)
  tiles.push(await sharp(Buffer.from(shot.result.data, 'base64')).extract({ left: cl, top: ct, width: cw, height: ch }).resize(400).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer())
}
const tw = 400, th = Math.round((ch * 400) / cw), cols = Math.min(4, tiles.length)
await sharp({ create: { width: cols * tw, height: Math.ceil(tiles.length / cols) * th, channels: 3, background: '#222' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * tw, top: Math.floor(i / cols) * th })))
  .png().toFile(out)
console.log(logs.join('\n') || '(no errors)')
ws.close()
proc.kill()
process.exit(0)
