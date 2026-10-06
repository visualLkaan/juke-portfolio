import { RAIL } from './config'

/** Phones / portrait screens get the scrollable DVD row instead of the floating arc. */
export function isRailLayout(width: number, height: number) {
  return width < RAIL.breakpoint || height > width
}
