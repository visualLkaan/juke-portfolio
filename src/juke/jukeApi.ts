import type { BehaviorCtx, BehaviorDirector } from './behaviors'

/** Lets code outside the Juke component (the DVD transitions) drive him. */
export const jukeApi = {
  director: null as BehaviorDirector | null,
  ctx: (() => null) as () => BehaviorCtx | null,
}

// Cassette slot behind the door, in head space (from the door's bounds in the model):
// the door is 0.2 wide, 0.1475 tall, hinged at y = 0.083, front face at z = 0.1407.
export const SLOT = {
  center: [-0.0073, 0.157, 0.1241] as [number, number, number],
  size: [0.185, 0.132] as [number, number],
  windowWidth: 0.2,
  windowFrontZ: 0.1407,
}
