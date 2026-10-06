import * as THREE from 'three'
import { ATMOS_GLSL, atmos } from '../scene/atmosphere'
import { ROOM } from './config'

export type ToonUniforms = {
  uRimColor: { value: THREE.Color }
  uRimStrength: { value: number }
  uRimDir: { value: THREE.Vector3 } // view space, direction towards the rim light
  uSpecColor: { value: THREE.Color }
  uSpecStrength: { value: number }
  uKeyDir: { value: THREE.Vector3 } // view space, direction towards the key light
  uRoughnessMap: { value: THREE.Texture | null }
}

export function makeGradientMap(steps: number[]) {
  const data = new Uint8Array(steps.map((s) => Math.round(THREE.MathUtils.clamp(s, 0, 1) * 255)))
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

/**
 * Toon version of the Meshy PBR material: keeps the base colour and normal maps,
 * shades through a stepped light ramp, and adds a soft fresnel rim plus a small,
 * hard-edged specular glint gated by the roughness map (so only the smooth plastic
 * edges catch it, not the whole box).
 */
export function createToonMaterial(source: THREE.MeshStandardMaterial, gradientMap: THREE.Texture) {
  const mat = new THREE.MeshToonMaterial({
    map: source.map,
    normalMap: source.normalMap,
    normalScale: source.normalScale.clone(),
    gradientMap,
    side: THREE.FrontSide,
  })

  for (const t of [source.map, source.normalMap]) if (t) t.anisotropy = 8

  const uniforms: ToonUniforms = {
    uRimColor: { value: new THREE.Color('#ff9a3c') },
    uRimStrength: { value: 0.4 },
    uRimDir: { value: new THREE.Vector3(0.6, 0.3, -0.7).normalize() },
    uSpecColor: { value: new THREE.Color('#ffe2b8') },
    uSpecStrength: { value: 0.35 },
    uKeyDir: { value: new THREE.Vector3(-0.5, 0.6, 0.6).normalize() },
    uRoughnessMap: { value: source.roughnessMap ?? source.metalnessMap ?? null },
  }

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      uTime: atmos.uTime,
      uWind: atmos.uWind,
      uSun: atmos.uSun,
      uJukeLeaf: { value: ROOM.jukeLeaf },
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vJWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvJWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        ${ATMOS_GLSL}
        varying vec3 vJWorld;
        uniform float uJukeLeaf;
        uniform vec3 uRimColor;
        uniform float uRimStrength;
        uniform vec3 uRimDir;
        uniform vec3 uSpecColor;
        uniform float uSpecStrength;
        uniform vec3 uKeyDir;
        uniform sampler2D uRoughnessMap;`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        vec3 jV = normalize(vViewPosition);
        float jNdV = clamp(dot(normal, jV), 0.0, 1.0);
        float jFres = pow(1.0 - jNdV, 3.0);
        float jRimSide = smoothstep(-0.3, 0.5, dot(normal, uRimDir));
        float jRim = smoothstep(0.25, 0.65, jFres) * (0.35 + 0.65 * jRimSide);
        outgoingLight += uRimColor * jRim * uRimStrength;

        float jRough = texture2D(uRoughnessMap, vMapUv).g;
        vec3 jH = normalize(uKeyDir + jV);
        float jSpec = smoothstep(0.955, 0.975, dot(normal, jH)) * smoothstep(0.85, 0.35, jRough);
        outgoingLight += uSpecColor * jSpec * uSpecStrength;

        // Same light as the room: breathes with the sun, leaf shadows drift over
        // the lit side, and everything near the rug darkens (contact occlusion).
        float jLit = smoothstep(0.0, 0.35, dot(normal, uKeyDir));
        float jLeaf = leafShadow(vec2(vJWorld.x + vJWorld.z * 0.5, vJWorld.y) * 2.4);
        outgoingLight *= 1.0 - jLeaf * uJukeLeaf * jLit;
        outgoingLight *= 1.0 + (uSun - 1.0) * 0.9 * jLit;
        outgoingLight *= mix(0.38, 1.0, smoothstep(0.0, 0.06, vJWorld.y));
        #include <opaque_fragment>`,
      )
  }
  // All Juke parts share one program.
  mat.customProgramCacheKey = () => 'juke-toon'
  mat.userData.uniforms = uniforms
  return { material: mat, uniforms }
}
