import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { ROOM } from '../juke/config'
import { ATMOS_GLSL, atmos } from './atmosphere'
import { BG_DISTANCE, CAMERA, PHOTO } from './layout'

// Masks pre-softened and packed by `npm run bake-masks`:
//   fx-a = (sun, lamp, fishbowl), fx-b = (smoothed depth, lamp glow, pennants)
const FX = { uFx: '/bg/fx-a.png', uFx2: '/bg/fx-b.png' } as const

const black = () => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  t.needsUpdate = true
  return t
}

/**
 * The room photo on a full-screen plane, made to feel alive by one shader:
 * 2.5D depth parallax, leaf shadows swaying in the sun patches, breathing sunlight,
 * light shafts, a glowing swaying paper lamp, rippling fishbowl water and
 * fluttering pennants. A missing mask simply turns its effect off (and is logged).
 */
export function Background() {
  const map = useTexture(PHOTO.url)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8

  const { height, width, z } = useMemo(() => {
    const height = 2 * BG_DISTANCE * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2))
    return { height, width: height * PHOTO.aspect, z: CAMERA.position[2] - BG_DISTANCE }
  }, [])

  const material = useMemo(() => {
    const uniforms = {
      ...atmos,
      uPhoto: { value: map },
      uAspect: { value: PHOTO.aspect },
      uFx: { value: black() },
      uFx2: { value: black() },
    }
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthWrite: false,
      toneMapped: false,
    })
  }, [map])

  // Effect maps load on their own: the photo shows at once, effects switch on as they arrive.
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    for (const [name, url] of Object.entries(FX) as [keyof typeof FX, string][]) {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.NoColorSpace
          material.uniforms[name].value = tex
        },
        undefined,
        () => console.warn(`[Juke] ${url} is missing — run \`npm run bake-masks\`. Background effects are off.`),
      )
    }
  }, [material])

  return (
    <mesh position={[CAMERA.position[0], CAMERA.position[1], z]} renderOrder={-1} material={material}>
      <planeGeometry args={[width, height]} />
    </mesh>
  )
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform sampler2D uPhoto;
uniform sampler2D uFx;  // sun, lamp, fishbowl (soft)
uniform sampler2D uFx2; // depth (smoothed), lamp glow, pennants
uniform float uAspect;
uniform vec2 uMouse;
uniform vec3 uGust;
varying vec2 vUv;

void main() {
  vec2 uv = (vUv - 0.5) / ${ROOM.photoScale.toFixed(3)} + 0.5;

  // 1. Depth parallax: near things (lighter) slide against the pointer, the far wall barely moves.
  float d = texture2D(uFx2, uv).r;
  // (sampling further along the pointer moves the content against it, like the 3D camera drift)
  uv += uMouse * (d - 0.22) * ${ROOM.parallax.toFixed(4)} * vec2(1.0, 0.65);

  // 2. Pennants flutter.
  vec4 m = texture2D(uFx, uv);
  float pen = texture2D(uFx2, uv).b;
  uv += pen * vec2(sin(uTime * 3.1 + uv.y * 42.0 + uv.x * 18.0) + 0.5 * sin(uTime * 1.3),
                   0.6 * cos(uTime * 2.6 + uv.x * 36.0)) * ${ROOM.pennantFlutter.toFixed(4)};

  // 3. Fishbowl water: refraction ripple.
  float fish = m.b;
  uv += fish * vec2(sin(uTime * 2.1 + uv.y * 140.0), cos(uTime * 1.8 + uv.x * 120.0)) * ${ROOM.fishRipple.toFixed(4)};

  // 4. Paper lamp sways very slowly.
  float lamp = m.g;
  uv.x += lamp * sin(uTime * 0.45) * ${ROOM.lampSway.toFixed(4)};
  uv.y += lamp * sin(uTime * 0.9) * ${(ROOM.lampSway * 0.3).toFixed(4)};

  // 5. Sun patches: the photo's own leaf shadows wobble a little...
  float sun = texture2D(uFx, uv).r;
  vec2 wp = uv * vec2(uAspect, 1.0) * 7.0;
  vec2 warp = vec2(aFbm(wp + uWind * 0.35), aFbm(wp + 9.0 - uWind * 0.3)) - 0.5;
  float gust = uGust.z * smoothstep(0.25, 0.0, distance(uv * vec2(uAspect, 1.0), uGust.xy * vec2(uAspect, 1.0)));
  uv += warp * sun * ${ROOM.sunWarp.toFixed(4)} * (1.0 + gust * 3.0);

  vec3 col = texture2D(uPhoto, uv).rgb;

  // ...new leaf shadows sway across them, and the light breathes.
  float leaf = leafShadow(uv * vec2(uAspect, 1.0) * ${ROOM.leafScale.toFixed(2)} + vec2(uv.y * 0.6, 0.0));
  col *= 1.0 - leaf * sun * ${ROOM.leafStrength.toFixed(3)};
  col *= 1.0 + sun * (uSun - 1.0);
  // Areas outside the sun react a little too (it's the room's main light).
  col *= 1.0 + (1.0 - sun) * (uSun - 1.0) * 0.35;

  // Fishbowl shimmer.
  float caustic = aNoise(uv * vec2(uAspect, 1.0) * 160.0 + vec2(uTime * 1.5, -uTime));
  col += fish * smoothstep(0.7, 0.98, caustic) * 0.04 * vec3(1.0, 0.95, 0.8);

  // Warm lamp glow, wider than the shade itself.
  float glow = texture2D(uFx2, uv).g;
  col += vec3(1.0, 0.72, 0.42) * glow * ${ROOM.lampGlow.toFixed(3)} * (0.9 + 0.1 * sin(uTime * 1.7));

  // Light shafts from the window.
  // (screen blend, so the shadows don't wash out)
  vec3 shaft = vec3(1.0, 0.78, 0.5) * lightShaft(vUv) * ${ROOM.shaftStrength.toFixed(3)};
  col = 1.0 - (1.0 - col) * (1.0 - shaft);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`
