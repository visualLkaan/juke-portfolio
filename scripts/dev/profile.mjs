// Dev-only: CPU-profiles a page load (Edge + CDP) and prints the heaviest functions.
// usage: node scripts/dev/profile.mjs <url> [ms]
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const [url, ms = '12000'] = process.argv.slice(2)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const port = 9333 + Math.floor(Math.random() * 500)
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'edgeprof-'))}`,
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const sleep = (t) => new Promise((r) => setTimeout(r, t))
let target
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
let id = 0; const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 500 })
await send('Emulation.setDeviceMetricsOverride', { width: 1350, height: 940, deviceScaleFactor: 1, mobile: false })
await send('Profiler.start'); await send('Page.navigate', { url }); await sleep(+ms)
const { result } = await send('Profiler.stop')
const p = result.profile, self = new Map(), byId = new Map(p.nodes.map((n) => [n.id, n]))
const dt = p.timeDeltas; const counts = new Map()
p.samples.forEach((s, i) => counts.set(s, (counts.get(s) ?? 0) + (dt[i] ?? 0)))
for (const [nid, t] of counts) { const n = byId.get(nid); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`; self.set(k, (self.get(k) ?? 0) + t / 1000) }
console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(0).padStart(6)}ms  ${k}`).join('\n'))
ws.close(); proc.kill(); process.exit(0)
