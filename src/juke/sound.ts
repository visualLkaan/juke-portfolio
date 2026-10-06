import { useJukeStore } from './useJukeStore'
import { engine, voiceOut } from '../audio/engine'

// Small synthesized cartoon sounds for Juke's reactions (WebAudio, no asset files).
// Silent when the volume is at zero.

export type SoundName = 'click' | 'hey' | 'bonk' | 'boing' | 'clap' | 'dizzy' | 'love' | 'grumble' | 'giggle' | 'notes'

// Runs through the shared engine so these share the room reverb with the DVD music.
function audio() {
  const { ac } = engine()
  return { ac, out: voiceOut(0, { reverb: 0.12, delay: 0 }) }
}

function tone(
  type: OscillatorType,
  freqs: [number, number] | number,
  start: number,
  dur: number,
  vol = 0.5,
  vibrato = 0,
) {
  const { ac, out } = audio()
  const t0 = ac.currentTime + start
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  const [f0, f1] = typeof freqs === 'number' ? [freqs, freqs] : freqs
  osc.frequency.setValueAtTime(f0, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
  if (vibrato) {
    const lfo = ac.createOscillator()
    const lg = ac.createGain()
    lfo.frequency.value = vibrato
    lg.gain.value = f0 * 0.08
    lfo.connect(lg).connect(osc.frequency)
    lfo.start(t0)
    lfo.stop(t0 + dur)
  }
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(out)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise(start: number, dur: number, vol = 0.4, freq = 1800) {
  const { ac, out } = audio()
  const t0 = ac.currentTime + start
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2
  const src = ac.createBufferSource()
  src.buffer = buf
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  const g = ac.createGain()
  g.gain.value = vol
  src.connect(bp).connect(g).connect(out)
  src.start(t0)
}

const SOUNDS: Record<SoundName, () => void> = {
  click: () => {
    tone('square', [1800, 1200], 0, 0.03, 0.25)
    tone('triangle', [500, 300], 0.005, 0.05, 0.3)
  },
  hey: () => {
    tone('square', [520, 700], 0, 0.09, 0.22)
    tone('square', [760, 1040], 0.1, 0.12, 0.22)
  },
  bonk: () => {
    tone('sine', [320, 90], 0, 0.18, 0.6)
    noise(0, 0.05, 0.3, 900)
  },
  boing: () => tone('sine', [140, 420], 0, 0.55, 0.5, 18),
  clap: () => {
    noise(0, 0.12, 0.7, 2200)
    tone('triangle', [900, 600], 0, 0.06, 0.2)
  },
  dizzy: () => {
    for (let i = 0; i < 5; i++) tone('sine', [900 - i * 120, 700 - i * 120], i * 0.09, 0.12, 0.25, 30)
  },
  love: () => {
    tone('sine', 660, 0, 0.18, 0.35)
    tone('sine', 880, 0.16, 0.3, 0.35)
  },
  grumble: () => tone('sawtooth', [140, 90], 0, 0.45, 0.18, 12),
  giggle: () => {
    for (let i = 0; i < 4; i++) tone('triangle', [700 + i * 40, 900 + i * 40], i * 0.08, 0.07, 0.25)
  },
  notes: () => {
    const scale = [523, 659, 784, 1047]
    scale.forEach((f, i) => tone('triangle', f, i * 0.09, 0.14, 0.25))
  },
}

export function playSound(name: SoundName) {
  if (useJukeStore.getState().volume <= 0) return
  try {
    SOUNDS[name]()
  } catch {
    // Audio can be unavailable (autoplay policies, old browsers); stay silent.
  }
}
