/*
 * Shared WebAudio engine: one context, a gentle master compressor, a generated
 * room reverb and a stereo ping-pong delay. Voices send into those buses, so every
 * synthesized sound sits in the same "space". No audio files are needed.
 */

export type Bus = { ac: AudioContext; dry: AudioNode; reverb: AudioNode; delay: AudioNode }

let bus: Bus | null = null
let master: GainNode | null = null
let level = 0.7

/** Perceptual curve: the slider feels even; 0.7 (the default) = the designed mix level. */
const gainFor = (v: number) => 0.72 * Math.pow(v, 1.5)

/** Set the master volume (0..1), smoothly. */
export function setMasterVolume(v: number) {
  level = v
  if (master && bus) master.gain.setTargetAtTime(gainFor(v), bus.ac.currentTime, 0.05)
}

/**
 * Browsers only allow audio after the visitor interacts with the page. Create /
 * resume the context on the first pointer or key press so sound is simply "on".
 */
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    engine()
    for (const e of ['pointerdown', 'keydown', 'touchend'] as const) window.removeEventListener(e, unlock)
  }
  for (const e of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(e, unlock)
}

export function engine(): Bus {
  if (!bus) bus = build()
  if (bus.ac.state === 'suspended') void bus.ac.resume()
  return bus
}

function build(): Bus {
  const ac = new AudioContext()

  const comp = ac.createDynamicsCompressor()
  comp.threshold.value = -16
  comp.knee.value = 12
  comp.ratio.value = 3
  comp.attack.value = 0.004
  comp.release.value = 0.25
  const m = ac.createGain()
  m.gain.value = gainFor(level)
  m.connect(comp).connect(ac.destination)
  master = m

  const dry = ac.createGain()
  dry.connect(m)

  // Reverb: decaying stereo noise that gets darker as it fades, like a small hall.
  const conv = ac.createConvolver()
  conv.buffer = impulse(ac, 2.6)
  const revIn = ac.createGain()
  const revHp = ac.createBiquadFilter()
  revHp.type = 'highpass'
  revHp.frequency.value = 220 // keep the low end clean
  const revOut = ac.createGain()
  revOut.gain.value = 0.55
  revIn.connect(revHp).connect(conv).connect(revOut).connect(m)

  // Ping-pong delay with a soft, darkening feedback loop.
  const delIn = ac.createGain()
  const dl = ac.createDelay(1)
  const dr = ac.createDelay(1)
  dl.delayTime.value = 0.19
  dr.delayTime.value = 0.285
  const fb = ac.createGain()
  fb.gain.value = 0.38
  const damp = ac.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 3800
  const pl = ac.createStereoPanner()
  const pr = ac.createStereoPanner()
  pl.pan.value = -0.7
  pr.pan.value = 0.7
  const delOut = ac.createGain()
  delOut.gain.value = 0.5
  delIn.connect(dl)
  dl.connect(pl).connect(delOut)
  dl.connect(dr)
  dr.connect(pr).connect(delOut)
  dr.connect(damp).connect(fb).connect(dl)
  delOut.connect(m)
  delOut.connect(revIn) // echoes bloom into the room too

  return { ac, dry, reverb: revIn, delay: delIn }
}

function impulse(ac: AudioContext, seconds: number) {
  const len = Math.floor(ac.sampleRate * seconds)
  const buf = ac.createBuffer(2, len, ac.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / len
      // One-pole lowpass whose cutoff falls over time: bright start, dark tail.
      const k = 0.9 - 0.75 * t
      lp += k * ((Math.random() * 2 - 1) - lp)
      const pre = i < ac.sampleRate * 0.012 ? 0 : 1 // short pre-delay
      d[i] = lp * pre * Math.pow(1 - t, 2.4)
    }
  }
  return buf
}

/** A voice's output: dry + sends, with stereo position. */
export function voiceOut(pan = 0, send = { reverb: 0.35, delay: 0.15 }) {
  const { ac, dry, reverb, delay } = engine()
  const out = ac.createGain()
  const p = ac.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  out.connect(p)
  p.connect(dry)
  const r = ac.createGain()
  r.gain.value = send.reverb
  p.connect(r).connect(reverb)
  const dlg = ac.createGain()
  dlg.gain.value = send.delay
  p.connect(dlg).connect(delay)
  return out
}

export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

// --- Instruments ------------------------------------------------------------------

/**
 * Glassy FM bell / celesta. `bright` raises the modulation index for a sparklier
 * attack. Each note also gets a quiet inharmonic partial for shimmer.
 */
export function bell(freq: number, at: number, dur = 1.2, vol = 0.18, pan = 0, bright = 1, send?: { reverb: number; delay: number }) {
  const { ac } = engine()
  const t = ac.currentTime + at
  const out = voiceOut(pan, send ?? { reverb: 0.45, delay: 0.22 })

  const car = ac.createOscillator()
  const mod = ac.createOscillator()
  const modGain = ac.createGain()
  car.frequency.value = freq
  mod.frequency.value = freq * 3.5
  modGain.gain.setValueAtTime(freq * 2.2 * bright, t)
  modGain.gain.exponentialRampToValueAtTime(freq * 0.05 + 1, t + 0.35)
  mod.connect(modGain).connect(car.frequency)

  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004)
  g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.12)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  car.connect(g).connect(out)

  // Shimmer partial.
  const p2 = ac.createOscillator()
  p2.frequency.value = freq * 2.76
  const g2 = ac.createGain()
  g2.gain.setValueAtTime(0.0001, t)
  g2.gain.exponentialRampToValueAtTime(vol * 0.18, t + 0.003)
  g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.4)
  p2.connect(g2).connect(out)

  for (const o of [car, mod, p2]) {
    o.start(t)
    o.stop(t + dur + 0.05)
  }
}

/** Fine glitter: a short burst of very high, fluttering noise. */
export function glitter(at: number, dur = 0.5, vol = 0.05, pan = 0, sweep: [number, number] = [6000, 11000]) {
  const { ac } = engine()
  const t = ac.currentTime + at
  const out = voiceOut(pan, { reverb: 0.6, delay: 0.25 })
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 2.5
  bp.frequency.setValueAtTime(sweep[0], t)
  bp.frequency.exponentialRampToValueAtTime(sweep[1], t + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  // Flutter, so it twinkles instead of hissing.
  const lfo = ac.createOscillator()
  lfo.frequency.value = 23
  const lg = ac.createGain()
  lg.gain.value = vol * 0.8
  lfo.connect(lg).connect(g.gain)
  src.connect(bp).connect(g).connect(out)
  src.start(t, Math.random())
  src.stop(t + dur + 0.05)
  lfo.start(t)
  lfo.stop(t + dur + 0.05)
}

/** Warm, slowly opening pad (detuned saws through a lowpass). */
export function pad(freqs: number[], at: number, dur: number, vol = 0.05, cutoff: [number, number] = [500, 2200]) {
  const { ac } = engine()
  const t = ac.currentTime + at
  const out = voiceOut(0, { reverb: 0.7, delay: 0.1 })
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.7
  lp.frequency.setValueAtTime(cutoff[0], t)
  lp.frequency.exponentialRampToValueAtTime(cutoff[1], t + dur * 0.8)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.5, dur * 0.35))
  g.gain.setValueAtTime(vol, t + dur * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6)
  lp.connect(g).connect(out)
  freqs.forEach((f, i) => {
    for (const det of [-7, 7]) {
      const o = ac.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.detune.value = det + (i % 2 ? 3 : -3)
      const og = ac.createGain()
      og.gain.value = 1 / (freqs.length * 2)
      o.connect(og).connect(lp)
      o.start(t)
      o.stop(t + dur + 0.7)
    }
  })
}

/** Round, soft bass note. */
export function bass(freq: number, at: number, dur = 0.6, vol = 0.22) {
  const { ac } = engine()
  const t = ac.currentTime + at
  const out = voiceOut(0, { reverb: 0.08, delay: 0 })
  const o = ac.createOscillator()
  o.type = 'triangle'
  o.frequency.value = freq
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 600
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(lp).connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
}

/** A deep "boom": pitch-dropping sine kick with a soft click on top. */
export function boom(at: number, vol = 0.6) {
  const { ac } = engine()
  const t = ac.currentTime + at
  const out = voiceOut(0, { reverb: 0.2, delay: 0 })
  const o = ac.createOscillator()
  o.frequency.setValueAtTime(130, t)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.35)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + 0.75)
  thunk(at, 0.12, 1800)
}

/** Filtered noise sweep (whoosh / riser). */
export function sweep(at: number, dur: number, from: number, to: number, vol = 0.08, pan: [number, number] = [0, 0]) {
  const { ac } = engine()
  const t = ac.currentTime + at
  const out = voiceOut(0, { reverb: 0.4, delay: 0.05 })
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.2
  bp.frequency.setValueAtTime(from, t)
  bp.frequency.exponentialRampToValueAtTime(to, t + dur)
  const p = ac.createStereoPanner()
  p.pan.setValueAtTime(pan[0], t)
  p.pan.linearRampToValueAtTime(pan[1], t + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.6)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp).connect(p).connect(g).connect(out)
  src.start(t, Math.random())
  src.stop(t + dur + 0.05)
}

/** Small mechanical click (case lid, cassette door). */
export function thunk(at: number, vol = 0.2, freq = 1200, pan = 0) {
  const { ac } = engine()
  const t = ac.currentTime + at
  const out = voiceOut(pan, { reverb: 0.15, delay: 0 })
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 4
  const g = ac.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
  src.connect(bp).connect(g).connect(out)
  src.start(t, Math.random())
  src.stop(t + 0.08)
  // A tiny resonant "tok" under the click.
  const o = ac.createOscillator()
  o.frequency.setValueAtTime(freq * 0.35, t)
  o.frequency.exponentialRampToValueAtTime(freq * 0.2, t + 0.05)
  const og = ac.createGain()
  og.gain.setValueAtTime(vol * 0.6, t)
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
  o.connect(og).connect(out)
  o.start(t)
  o.stop(t + 0.08)
}

let noiseBuf: AudioBuffer | null = null
function noiseBuffer(ac: AudioContext) {
  if (noiseBuf) return noiseBuf
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noiseBuf
}
