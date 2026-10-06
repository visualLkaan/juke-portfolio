// All of Juke's tunable timings and looks live here.

export const FACE = {
  // How fast expression parameters glide to their targets (higher = snappier).
  transitionRate: 9,
  // Eye plate radius as a fraction of the speaker's half-size (must hide the baked eyes).
  plateRadius: 1.05,
  // Gap in front of the speaker cap.
  plateOffset: 0.006,
  canvasSize: 256,
  colors: {
    lid: '#8f8576',
    white: '#fbf6ea',
    ink: '#120c08',
    heart: '#ff3b6b',
    star: '#ffd23f',
    blush: '#ff7aa8',
  },
}

export const BLINK = {
  minInterval: 2, // seconds
  maxInterval: 6,
  duration: 0.12,
  doubleChance: 0.2,
  // When the eye shape changes (e.g. normal -> heart) we hide the swap behind a blink.
  shapeSwapDuration: 0.16,
}

export const LOOK = {
  // Pupil travel per NDC unit of cursor offset.
  pupilGain: 1.6,
  pupilRate: 14,
  headMaxYaw: 0.175, // ~10°
  headMaxPitch: 0.12,
  headGain: 0.3,
  headRate: 5,
  // Seconds without mouse movement before Juke starts looking around on his own.
  idleAfter: 5,
  idleGlanceMin: 0.9,
  idleGlanceMax: 2.6,
}

export const BROWS = {
  width: 0.7, // fraction of the plate diameter
  thickness: 0.009,
  arch: 0.018,
  gap: 0.03, // above the top of the speaker
  heightRange: 0.035, // browHeight 1 lifts by this much
  color: '#120c08',
}

// Continuous "alive" layer — always running.
export const IDLE = {
  bpm: 100,
  breathRate: 0.28, // Hz
  breathScale: 0.02, // torso y-scale ±2%
  breathHeadLift: 0.006,
  handFloat: 0.012,
  thumpScale: 0.022, // speaker scale on each beat
  thumpCap: 0.006, // the caps push out a bit more
  handleSway: 0.04,
  weightShiftRate: 0.2, // Hz
  weightShift: 0.008,
  weightTilt: 0.02,
}

// Random behaviours.
export const BEHAVIOR = {
  minGap: 8, // seconds between behaviours
  maxGap: 20,
  sleepAfter: 60, // seconds without interaction before dozing off
  zEvery: 1.3,
  heartEvery: 0.35,
  sweatEvery: 1.4,
  // Fallback glance target before the DVDs have mounted.
  dvdSpot: [0.45, 0.65, 1.1] as [number, number, number],
}

export const PARTICLES = {
  pool: 48,
  types: {
    note: { life: 1.8, size: 0.07, rise: 0.22, spin: 1.5 },
    heart: { life: 1.6, size: 0.065, rise: 0.2, spin: 0.6 },
    sweat: { life: 1.1, size: 0.045, rise: 0, spin: 0 },
    z: { life: 2.4, size: 0.06, rise: 0.12, spin: 0.4 },
  },
}

export const INTERACT = {
  // This many clicks within `rapidWindow` seconds triggers the annoyed easter egg.
  rapidClicks: 5,
  rapidWindow: 2.2,
}

// DVD insert / eject transitions (seconds from the click). The music in
// src/dvd/dvdSounds.ts is written on the same grid: one step = 1/16 of the insert.
export const TRANSITION = {
  step: 0.1625,
  insert: {
    fly: [0.05, 0.5] as [number, number], // DVD flies to Juke's hand
    catch: 0.5,
    doorOpen: 0.55,
    lidOpen: 0.6,
    discOut: [0.8, 1.35] as [number, number], // disc leaves the case, spins to the slot
    discIn: [1.35, 1.72] as [number, number], // ...and slides in
    doorClose: 1.75,
    thump: 1.95,
    push: [1.98, 2.56] as [number, number], // camera dolly into the cassette window
    flash: 2.62,
  },
  eject: {
    reveal: 0.35, // flash covers the page, then fades
    pull: [0.3, 1.15] as [number, number],
    doorOpen: 0.75,
    discOut: [0.85, 1.3] as [number, number],
    discHome: [1.3, 1.6] as [number, number],
    doorClose: 1.55,
    flyBack: [1.65, 2.3] as [number, number],
    wave: 2.1,
  },
  cameraFov: 26, // FOV at the end of the push
  fillWindow: 1.15, // cassette window width / screen width at the end of the push (>1 = overfills)
  holdScale: 0.8, // DVD size in Juke's hand
}

// The living room photo (Stage 7). Strengths are subtle on purpose.
export const ROOM = {
  parallax: 0.016, // max UV shift for the closest pixels (~1.5%)
  cameraDrift: [0.035, 0.018] as [number, number], // 3D camera follows the pointer this much (world units)
  photoScale: 1.05, // zoom so the parallax never shows the edges
  leafStrength: 0.32, // how dark the moving leaf shadows get inside sun patches
  leafScale: 3.2,
  sunWarp: 0.0028, // UV wobble that sways the photo's own leaf shadows
  windSpeed: 0.55,
  breath: { amount: 0.06, period: 15 }, // ±6% over 15 s
  cloud: { minGap: 25, maxGap: 60, dim: 0.14, fadeIn: 1.4, hold: [1.5, 3.5] as [number, number], fadeOut: 2.2 },
  shaftStrength: 0.12,
  lampGlow: 0.16,
  lampSway: 0.0018,
  fishRipple: 0.0013,
  pennantFlutter: 0.0028,
  dust: { count: 260, size: 0.03 },
  jukeLeaf: 0.16, // leaf shadows passing over Juke
  grain: 0.03,
  vignette: 0.45,
}
