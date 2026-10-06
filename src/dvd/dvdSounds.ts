import type { Project } from '../data/projects'
import { bass, bell, boom, glitter, midi, pad, sweep, thunk } from '../audio/engine'
import { TRANSITION } from '../juke/config'
import { useJukeStore } from '../juke/useJukeStore'

/*
 * DVD music. Every project has its own key, so each DVD "sounds like itself":
 * - hover: a quick, starry arpeggio of glassy bells with a twinkle of glitter;
 * - select: a ~2.6 s piece in the same key that scores the whole insert
 *   transition (flight, cassette door, bass thump, camera push, flash). It picks
 *   one of several melodies each time, over a I–vi–IV–V progression;
 * - eject: a gentle descending reply and a little "bye" motif.
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
// Project keys (semitones from C), spread so neighbouring DVDs differ.
const KEYS = [0, 5, 2, 7, -3, 4, -2, 3, 6, -5, 1, -4]

const on = () => useJukeStore.getState().volume > 0
const safe = (fn: () => void) => {
  if (!on()) return
  try {
    fn()
  } catch {
    // Audio unavailable (autoplay policy, old browser): stay silent.
  }
}

/** MIDI note of scale degree `d` (0 = tonic, 7 = an octave up) above `root`. */
const deg = (root: number, d: number) => root + Math.floor(d / 7) * 12 + MAJOR[((d % 7) + 7) % 7]
const rootOf = (index: number) => 72 + KEYS[index % KEYS.length]
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]

// --- Hover ----------------------------------------------------------------------

const SPARKLES = [
  [0, 2, 4, 7],
  [2, 4, 7, 9],
  [0, 4, 7, 11],
  [4, 7, 9, 11],
  [0, 2, 4, 6, 7],
  [7, 4, 9, 11],
]
let lastHover = 0

export function playDvdHover(_p: Project, pan: number, index: number) {
  const now = performance.now()
  if (now - lastHover < 90) return
  lastHover = now
  safe(() => {
    const root = rootOf(index) + 12
    const notes = pick(SPARKLES)
    const gap = rand(0.034, 0.046)
    notes.forEach((d, i) => {
      const last = i === notes.length - 1
      const f = midi(deg(root, d)) * (1 + rand(-0.002, 0.002))
      const p = pan * 0.8 + (i / notes.length - 0.5) * 0.5
      bell(f, i * gap, last ? 1.6 : 0.7, last ? 0.11 : 0.075, p, last ? 1.1 : 0.8)
    })
    // A soft octave "halo" under the last note, and the twinkle.
    bell(midi(deg(root, notes[notes.length - 1]) - 12), notes.length * gap, 1.4, 0.035, pan * 0.5, 0.4)
    glitter(0.01, 0.55, 0.03, pan, [7000, 12000])
  })
}

// --- Select: the insert transition score ----------------------------------------------

// 16 steps over I | vi | IV | V, in scale degrees (null = rest). Resolves on the flash.
const MELODIES: (number | null)[][] = [
  [0, 2, 4, 7, 5, 7, 9, 7, 3, 5, 7, 10, 4, 6, 8, 11],
  [4, null, 2, 4, 5, null, 4, 2, 3, 5, 7, 5, 6, 8, 9, 11],
  [7, 4, 2, 4, 9, 7, 5, 7, 10, 9, 7, 5, 8, 9, 10, 11],
  [0, 4, 7, 4, 2, 5, 9, 5, 3, 7, 10, 7, 4, 8, 11, 13],
  [9, 7, 4, null, 7, 5, 2, null, 8, 7, 5, 3, 4, 6, 8, 11],
  [2, 4, 7, 9, 9, 7, 5, 4, 3, null, 5, 7, 6, 7, 8, 11],
  [7, null, 9, 7, 5, null, 7, 9, 10, 9, 7, null, 8, 11, 13, 11],
]
const CHORDS = [
  [0, 2, 4], // I
  [5, 7, 9], // vi
  [3, 5, 7], // IV
  [4, 6, 8], // V
]
let lastMelody = -1

export function playDvdSelect(index: number, pan: number) {
  safe(() => {
    const T = TRANSITION.insert
    const s = TRANSITION.step
    const root = rootOf(index)
    let m = Math.floor(Math.random() * MELODIES.length)
    if (m === lastMelody) m = (m + 1) % MELODIES.length
    lastMelody = m
    const melody = MELODIES[m]
    const swing = Math.random() < 0.5 ? 0 : s * 0.12 // sometimes a lazier groove

    // Pick-up: the hover sparkle, bigger, and the DVD whooshing toward Juke.
    ;[0, 2, 4, 7, 9].forEach((d, i) => bell(midi(deg(root + 12, d)), i * 0.03, 0.9, 0.08, pan, 1))
    glitter(0, 0.8, 0.04, pan, [6000, 12000])
    sweep(T.fly[0], T.fly[1] - T.fly[0] + 0.15, 900, 3200, 0.06, [pan, 0.1])

    // Harmony: pad chords and a soft bass on each bar.
    CHORDS.forEach((c, bar) => {
      const at = bar * 4 * s
      pad(c.map((d) => midi(deg(root - 12, d))), at, 4 * s + 0.1, 0.045, [450, 1800 + bar * 500])
      bass(midi(deg(root - 24, c[0])), at, 4 * s, 0.17)
      if (bar % 2 === 1) bass(midi(deg(root - 24, c[0])), at + 3 * s, s, 0.1)
    })

    // Melody, doubled an octave up very softly for sparkle; louder toward the end.
    melody.forEach((d, i) => {
      if (d === null) return
      const at = i * s + (i % 2 ? swing : 0)
      const v = 0.07 + (i / 16) * 0.05
      const p = Math.sin(i * 0.9) * 0.35
      bell(midi(deg(root, d)), at, 0.9, v, p, 0.9)
      bell(midi(deg(root, d) + 12), at + 0.004, 0.5, v * 0.25, -p, 0.5)
    })

    // Mechanics inside the music: door open, case lid, door shut.
    thunk(T.doorOpen, 0.12, 1500, -0.2)
    thunk(T.lidOpen + 0.05, 0.08, 2400, 0.3)
    sweep(T.discOut[0], T.discIn[1] - T.discOut[0], 2500, 7000, 0.025, [0.3, -0.1])
    thunk(T.doorClose, 0.2, 900)

    // Bass thump with Juke's speakers.
    boom(T.thump, 0.55)
    glitter(T.thump, 0.4, 0.03, 0)

    // Camera push: rising air and a rising glide into the flash.
    sweep(T.push[0], T.flash - T.push[0] + 0.05, 350, 7500, 0.07)
    for (let i = 0; i < 6; i++) bell(midi(deg(root, 7 + i)), T.push[0] + i * ((T.flash - T.push[0]) / 6), 0.4, 0.035 + i * 0.008, (i % 2 ? 1 : -1) * 0.4, 1.2)

    // The flash: a big, bright tonic chord with a long tail into the project page.
    const flash = [0, 4, 7, 9, 11, 14].map((d) => midi(deg(root + 12, d)))
    flash.forEach((f, i) => bell(f, T.flash + i * 0.012, 2.6, 0.075, (i - 2.5) * 0.25, 1.3))
    pad([0, 4, 7, 11].map((d) => midi(deg(root - 12, d))), T.flash, 1.6, 0.05, [1200, 3500])
    bass(midi(root - 24), T.flash, 1.4, 0.18)
    glitter(T.flash, 1.6, 0.05, 0, [5000, 13000])
  })
}

// --- Eject ------------------------------------------------------------------------

export function playDvdEject(index: number) {
  safe(() => {
    const E = TRANSITION.eject
    const root = rootOf(index)
    glitter(0, 0.6, 0.035, 0, [11000, 6000])
    // Pulling back out of the cassette: a falling air sweep.
    sweep(E.pull[0], E.pull[1] - E.pull[0], 6000, 400, 0.06)
    thunk(E.doorOpen, 0.13, 1500)
    // The disc coming out: a descending sparkle in the project's key.
    ;[14, 11, 9, 7, 4, 2].forEach((d, i) => bell(midi(deg(root, d)), E.discOut[0] + i * 0.06, 0.8, 0.07, 0.4 - i * 0.12, 0.9))
    pad([0, 4, 7].map((d) => midi(deg(root - 12, d))), E.pull[0], 1.4, 0.035, [1500, 600])
    thunk(E.discHome[1], 0.09, 2400, 0.3)
    thunk(E.doorClose, 0.17, 900)
    sweep(E.flyBack[0], E.flyBack[1] - E.flyBack[0], 3000, 900, 0.05, [0, 0.6])
    // "Bye!": a cheerful little motif as Juke waves.
    const bye = pick([
      [4, 7, 9, 7, 14],
      [7, 9, 11, 14],
      [2, 4, 7, 11, 14],
    ])
    bye.forEach((d, i) => bell(midi(deg(root, d)), E.wave + i * 0.11, i === bye.length - 1 ? 1.4 : 0.6, 0.075, -0.2 + i * 0.1, 0.9))
    bass(midi(root - 24), E.wave, 1, 0.14)
  })
}

// --- Side flip ---------------------------------------------------------------------

/** Flipping the tape: a mechanical clunk and whir, then a sparkle in the new side's key. */
export function playSideFlip(side: 'A' | 'B' | 'C') {
  safe(() => {
    const root = { A: 72, B: 77, C: 74 }[side]
    thunk(0, 0.15, 1100, -0.2)
    sweep(0.05, 0.38, 600, 3200, 0.05, [-0.4, 0.4])
    thunk(0.44, 0.18, 900, 0.2)
    ;[0, 4, 7, 11, 14].forEach((d, i) => bell(midi(deg(root, d)), 0.5 + i * 0.07, i === 4 ? 1.4 : 0.6, 0.075, -0.4 + i * 0.2, 1))
    pad([0, 4, 7].map((d) => midi(deg(root - 12, d))), 0.45, 1.2, 0.035, [600, 2400])
    glitter(0.5, 0.7, 0.035, 0.2, [7000, 12000])
  })
}

// --- Contact DVD ------------------------------------------------------------------

/** A contact DVD opens its link: a quick rising "see you there!" run in its key. */
export function playContactOpen(index: number) {
  safe(() => {
    const root = rootOf(index)
    thunk(0, 0.12, 1300, 0)
    ;[0, 2, 4, 7, 9, 14].forEach((d, i) => bell(midi(deg(root, d)), 0.04 + i * 0.06, i === 5 ? 1.3 : 0.5, 0.07, -0.5 + i * 0.2, 1))
    bass(midi(root - 24), 0.04, 0.8, 0.12)
    glitter(0.3, 0.6, 0.03, 0.4, [7000, 12000])
  })
}
