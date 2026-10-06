// The visitor asked the OS for less motion: calmer floating, no parallax drift.
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

export const reducedMotion = () => !!mq?.matches

/** 1 normally, `reduced` when motion should be reduced. */
export const motionScale = (reduced = 0.25) => (mq?.matches ? reduced : 1)
