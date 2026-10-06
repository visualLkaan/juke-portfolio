// DVD case look, floating layout and hover feel.

export const CASE = {
  // World units (Juke is 0.8 tall). A real case is 135 × 190 × 14 mm.
  width: 0.19,
  height: 0.27,
  depth: 0.026,
  lidThickness: 0.0055,
  radius: 0.006,
  discRadius: 0.083,
  plastic: '#1c1b21',
  inner: '#2b2a31',
}

// Cover canvases (px). Front/back share the case's aspect ratio.
export const CANVAS = {
  front: [640, 910] as [number, number],
  spine: [100, 1040] as [number, number],
  disc: 512,
  inner: [320, 455] as [number, number],
  titleFont: '"Lilita One", "Arial Black", sans-serif',
  bodyFont: '"Nunito", "Segoe UI", sans-serif',
}

export const FLOAT = {
  speed: [1.1, 1.8] as [number, number],
  rotationIntensity: 0.35,
  floatIntensity: 0.5,
  range: [-0.025, 0.025] as [number, number],
}

// Desktop: a loose rainbow-shaped arc to Juke's right. Angles in degrees on an
// ellipse around `center` (180 = left end near Juke, 0 = right end).
export const SHELF = {
  center: [0.6, 0.32] as [number, number],
  radius: [0.6, 0.48] as [number, number], // ellipse x / y radius of the outer row
  rowShrink: 0.5, // the inner row's arc is this much smaller
  singleRowMax: 7, // more projects than this → a second, inner row
  angles: [160, 20] as [number, number],
  z: 1.4,
  rowDepth: 0.14, // inner rows float a bit closer to the camera
  scale: 1.08,
  jitter: 0.035,
  tilt: 0.14, // random roll, radians
  faceJuke: -0.12, // extra yaw toward Juke, on top of facing the camera
}

export const HOVER = {
  forward: 0.2,
  scale: 1.12,
  discOut: 0.9, // fraction of the disc radius that slides out
  rate: 10,
  // How strong the "light" version of the project's expression is.
  expressionWeight: 0.55,
}

// Mobile: a horizontally scrollable row along the bottom of the screen.
export const RAIL = {
  breakpoint: 768, // px; also used when the screen is portrait
  itemPx: 118,
  heightPx: 190,
  z: 2.7,
}
