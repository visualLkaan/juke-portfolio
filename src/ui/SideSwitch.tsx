import { useRef, useState } from 'react'
import { SIDES, type Side } from '../data/projects'
import { useDvdStore } from '../dvd/dvdState'
import { isLocked } from '../transitions/transitionStore'
import './SideSwitch.css'

const FLIP_LOCK = 1400 // ms — one flip at a time

/** Tape-deck style switch between side A and side B of the DVD shelf. */
export function SideSwitch() {
  const side = useDvdStore((s) => s.side)
  const setSide = useDvdStore((s) => s.setSide)
  const [touched, setTouched] = useState(false)
  const lockedUntil = useRef(0)

  const flip = () => {
    if (isLocked() || performance.now() < lockedUntil.current) return
    lockedUntil.current = performance.now() + FLIP_LOCK
    setTouched(true)
    setSide(side === 'A' ? 'B' : 'A')
  }
  const other: Side = side === 'A' ? 'B' : 'A'

  return (
    <div className={`side-switch${touched ? '' : ' is-new'}`} role="group" aria-label="Shelf side">
      <button type="button" className="side-switch__arrow" onClick={flip} aria-label={`Flip to side ${other}: ${SIDES[other]}`}>
        ◀
      </button>
      <button type="button" className="side-switch__lcd" onClick={flip} aria-live="polite" aria-label={`Side ${side}: ${SIDES[side]}. Flip the tape`}>
        <span className="side-switch__reel" aria-hidden="true" />
        <span className="side-switch__side">SIDE {side}</span>
        <span className="side-switch__name">{SIDES[side]}</span>
      </button>
      <button type="button" className="side-switch__arrow side-switch__arrow--next" onClick={flip} aria-label={`Flip to side ${other}: ${SIDES[other]}`}>
        ▶
      </button>
    </div>
  )
}
