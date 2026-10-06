import { Environment, Lightformer } from '@react-three/drei'

/**
 * A tiny environment map, built locally from light cards matching the room: warm
 * sunset from the window on the left, green wall bounce, a soft ceiling strip.
 * Only the physical materials (the glossy DVD cases and discs) reflect it — Juke's
 * toon materials ignore it.
 */
export function Reflections() {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={0.9}>
      <color attach="background" args={['#2a2016']} />
      <Lightformer form="rect" color="#ffb35c" intensity={6} scale={[6, 4, 1]} position={[-6, 2, 3]} rotation-y={Math.PI / 2} />
      <Lightformer form="rect" color="#9bbf8a" intensity={1.6} scale={[8, 4, 1]} position={[6, 1, 0]} rotation-y={-Math.PI / 2} />
      <Lightformer form="rect" color="#fff1dc" intensity={2.5} scale={[10, 1.2, 1]} position={[0, 5, 1]} rotation-x={Math.PI / 2} />
      <Lightformer form="ring" color="#ffd9a8" intensity={3} scale={1.6} position={[0, 1.5, 6]} />
      <Lightformer form="rect" color="#ff8a2a" intensity={2} scale={[6, 2, 1]} position={[2, 1, -6]} />
    </Environment>
  )
}
