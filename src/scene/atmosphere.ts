import * as THREE from 'three'

/*
 * Shared "weather" of the room. The same uniform objects are plugged into the
 * background shader, Juke's toon material and the dust, so leaf shadows, sun
 * breathing and passing clouds stay in sync everywhere. <Atmosphere> updates them.
 */
export const atmos = {
  uTime: { value: 0 },
  // Accumulated wind phase: drifts steadily, speeds up during gusts.
  uWind: { value: 0 },
  // Sunlight level (1 = as photographed): slow breathing ±5–10% and cloud dips.
  uSun: { value: 1 },
  // Smoothed pointer / gyroscope, -1..1.
  uMouse: { value: new THREE.Vector2() },
  // Local gust: xy = photo uv, z = strength 0..1 (used by room clicks in Stage 7.5).
  uGust: { value: new THREE.Vector3(0.5, 0.5, 0) },
}

/** Cloud cover 0..1 (read by Juke's reactions later). */
export const weather = { cloud: 0, gust: 0 }

/* GLSL shared by every shader that shows leaf shadows or light shafts. */
export const ATMOS_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform float uSun;

float aHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float aNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(aHash(i), aHash(i + vec2(1, 0)), u.x), mix(aHash(i + vec2(0, 1)), aHash(i + vec2(1, 1)), u.x), u.y);
}
float aFbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * aNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}

/*
 * Dappled shadow of leaves on a branch swaying in the wind. 1 = shadow.
 * The branch sways as a whole (low-frequency offset) and each clump flutters.
 */
float leafShadow(vec2 p) {
  vec2 sway = vec2(sin(uWind * 0.9) * 0.35 + sin(uWind * 2.3) * 0.08, cos(uWind * 0.7) * 0.2);
  vec2 q = p + sway;
  q += 0.35 * vec2(aFbm(q * 0.8 + uWind * 0.15), aFbm(q * 0.8 - uWind * 0.12 + 5.0)); // domain warp
  float n = aFbm(q * 1.6);
  float flutter = aNoise(q * 6.0 + uWind * 1.7) * 0.12;
  return smoothstep(0.5, 0.62, n + flutter);
}

/*
 * Soft light shafts slanting down to the right from the off-screen window on the
 * left. uv is photo space (0..1, y up). Returns 0..1.
 */
float lightShaft(vec2 uv) {
  vec2 dir = normalize(vec2(0.82, -0.57));
  vec2 perp = vec2(-dir.y, dir.x);
  float along = dot(uv - vec2(-0.05, 1.0), dir);
  float across = dot(uv, perp);
  float bands = aNoise(vec2(across * 9.0, uTime * 0.03)) * 0.6 + aNoise(vec2(across * 23.0 + 3.0, uTime * 0.05)) * 0.4;
  bands = smoothstep(0.45, 0.85, bands);
  float fade = smoothstep(1.25, 0.15, along) * smoothstep(-0.05, 0.25, along);
  return bands * fade * uSun;
}
`
