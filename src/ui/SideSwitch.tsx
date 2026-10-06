import { useRef, useState } from 'react'
import { SIDES, SIDE_ORDER, type Side } from '../data/projects'
import { useDvdStore } from '../dvd/dvdState'
import { isLocked } from '../transitions/transitionStore'
import './SideSwitch.css'

const FLIP_LOCK = 1400 // ms — one flip at a time

/** Tape-deck style switch stepping through the sides of the DVD shelf (A → B → C → A). */
export function SideSwitch() {
  const side = useDvdStore((s) => s.side)
  const setSide = useDvdStore((s) => s.setSide)
  const [touched, setTouched] = useState(false)
  const lockedUntil = useRef(0)

  const step = (dir: 1 | -1): Side => SIDE_ORDER[(SIDE_ORDER.indexOf(side) + dir + SIDE_ORDER.length) % SIDE_ORDER.length]
  const flip = (dir: 1 | -1) => () => {
    if (isLocked() || performance.now() < lockedUntil.current) return
    lockedUntil.current = performance.now() + FLIP_LOCK
    setTouched(true)
    setSide(step(dir))
  }
  const prev = step(-1)
  const next = step(1)

  return (
    <div className={`side-switch${touched ? '' : ' is-new'}`} role="group" aria-label="Shelf side">
      <button type="button" className="side-switch__arrow" onClick={flip(-1)} aria-label={`Flip to side ${prev}: ${SIDES[prev]}`}>
        ◀
      </button>
      <button type="button" className="side-switch__lcd" onClick={flip(1)} aria-live="polite" aria-label={`Side ${side}: ${SIDES[side]}. Flip the tape`}>
        <span className="side-switch__reel" aria-hidden="true" />
        <span className="side-switch__side">SIDE {side}</span>
        <span className="side-switch__name">{SIDES[side]}</span>
      </button>
      <button type="button" className="side-switch__arrow side-switch__arrow--next" onClick={flip(1)} aria-label={`Flip to side ${next}: ${SIDES[next]}`}>
        ▶
      </button>
    </div>
  )
}
