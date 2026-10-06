import * as THREE from 'three'

// World-space directions *towards* each light, written by <Lights> and read by the
// toon shader (which needs them in view space for the rim and specular terms).
export const lightRig = {
  keyDir: new THREE.Vector3(-1, 1, 1).normalize(),
  rimDir: new THREE.Vector3(1, 0.6, -1).normalize(),
}
