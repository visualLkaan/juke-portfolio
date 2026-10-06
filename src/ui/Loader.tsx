import { useEffect, useState } from 'react'
import { useLoad } from './loadState'
import './Loader.css'

type Phase = 'sleep' | 'wake' | 'happy' | 'leave'

// Shortest time the sleepy face stays up, so a fast load still reads as "waking up".
const MIN_SLEEP = 1300

/**
 * Intro screen: Juke's face (same toon language as the 3D Juke — thick ink
 * outline, tan boombox, cream eye plates) dozing while the room loads, the tape
 * reels in his cassette window turning with the progress. When the room is
 * ready he wakes up, smiles, and the screen opens into the room.
 */
export function Loader() {
  const progress = useLoad((s) => s.progress)
  const sceneReady = useLoad((s) => s.sceneReady)
  const [phase, setPhase] = useState<Phase>('sleep')
  const [minDone, setMinDone] = useState(false)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), MIN_SLEEP)
    return () => clearTimeout(t)
  }, [])

  // The number eases toward the real progress (and creeps while the code downloads).
  useEffect(() => {
    const id = setInterval(() => {
      setShown((v) => {
        const target = Math.max(progress, Math.min(0.3, v + 0.004))
        return v + (target - v) * 0.18
      })
    }, 50)
    return () => clearInterval(id)
  }, [progress])

  // Wake-up sequence, once the room is ready (phase isn't a dependency: changing it
  // must not cancel the remaining steps).
  const ready = sceneReady && minDone
  useEffect(() => {
    if (!ready) return
    const timers = [
      setTimeout(() => setPhase('wake'), 150),
      setTimeout(() => setPhase('happy'), 900),
      setTimeout(() => setPhase('leave'), 1750),
      setTimeout(() => useLoad.getState().set({ introDone: true }), 2450),
    ]
    return () => timers.forEach(clearTimeout)
  }, [ready])

  const pct = phase === 'sleep' ? Math.min(99, Math.round(shown * 100)) : 100

  return (
    <div className={`loader loader--${phase}`} role="status" aria-live="polite" aria-label={phase === 'sleep' ? `Loading ${pct}%` : 'Ready'}>
      {/* Shiny discs catching light beams, in two corners. */}
      {(['tl', 'br'] as const).map((corner) => (
        <div key={corner} className={`loader__corner loader__corner--${corner}`} aria-hidden="true">
          <span className="loader__beam" />
          <span className="loader__disc">
            <span className="loader__disc-glare" />
            <span className="loader__disc-hub" />
          </span>
          <span className="loader__spark loader__spark--1" />
          <span className="loader__spark loader__spark--2" />
          <span className="loader__spark loader__spark--3" />
        </div>
      ))}
      <div className="loader__stage">
        <svg className="loader__face" viewBox="0 0 300 210" aria-hidden="true">
          <defs>
            <linearGradient id="lf-box" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d8b679" />
              <stop offset="1" stopColor="#b8925a" />
            </linearGradient>
            <clipPath id="lf-window">
              <rect x="117" y="113" width="66" height="40" rx="4" />
            </clipPath>
          </defs>

          <g className="lf-body">
            {/* Handle */}
            <path className="lf-handle" d="M100 66 V30 q0 -12 12 -12 h76 q12 0 12 12 V66 h-16 V36 q0 -4 -4 -4 h-60 q-4 0 -4 4 V66 z" />
            {/* Buttons */}
            {[110, 132, 154, 176].map((x, i) => (
              <rect key={x} className={`lf-button lf-button--${i}`} x={x} y="52" width="18" height="16" rx="3" />
            ))}
            {/* Box */}
            <rect className="lf-box" x="16" y="62" width="268" height="130" rx="16" />
            <rect className="lf-box-shine" x="26" y="70" width="248" height="10" rx="5" />

            {/* Brows */}
            <path className="lf-brow lf-brow--l" d="M44 86 q30 -12 60 0" />
            <path className="lf-brow lf-brow--r" d="M196 86 q30 -12 60 0" />

            {/* Eyes: speaker ring + cream plate; closed / open / happy states */}
            {[74, 226].map((cx, i) => (
              <g key={cx} className={`lf-eye lf-eye--${i ? 'r' : 'l'}`} transform={`translate(${cx} 132)`}>
                <circle className="lf-speaker" r="44" />
                <circle className="lf-plate" r="35" />
                <g className="lf-open">
                  <circle className="lf-pupil" r="13" cx={i ? -4 : 4} cy="2" />
                  <circle className="lf-glint" r="4" cx={i ? 0 : 8} cy="-3" />
                </g>
                <path className="lf-closed" d="M-22 4 q22 14 44 0" />
                <path className="lf-happy" d="M-20 8 q20 -24 40 0" />
              </g>
            ))}
            <ellipse className="lf-blush" cx="74" cy="183" rx="16" ry="6" />
            <ellipse className="lf-blush" cx="226" cy="183" rx="16" ry="6" />

            {/* Cassette window: tape reels turning with the progress */}
            <rect className="lf-cassette" x="112" y="94" width="76" height="64" rx="6" />
            <rect className="lf-cassette-strip" x="112" y="94" width="76" height="16" rx="6" />
            <rect className="lf-window" x="117" y="113" width="66" height="40" rx="4" />
            <g clipPath="url(#lf-window)">
              <rect className="lf-tape" x="117" y="131" width={66 * Math.max(0.04, pct / 100)} height="4" />
              <g transform="translate(134 133)">
                <g className="lf-reel">
                  <circle r="10" />
                  <path d="M0 -10 V10 M-10 0 H10" />
                </g>
              </g>
              <g transform="translate(166 133)">
                <g className="lf-reel">
                  <circle r="10" />
                  <path d="M0 -10 V10 M-10 0 H10" />
                </g>
              </g>
            </g>
          </g>

          {/* Sleepy z's */}
          <g className="lf-zs">
            <text className="lf-z lf-z--1" x="262" y="56">z</text>
            <text className="lf-z lf-z--2" x="276" y="38">z</text>
            <text className="lf-z lf-z--3" x="288" y="22">Z</text>
          </g>
        </svg>

        <div className="loader__text">
          <span className="loader__title">{phase === 'sleep' ? 'Juke is waking up' : 'Hi there!'}</span>
          <span className="loader__lcd">{phase === 'sleep' ? `▶ LOADING ${String(pct).padStart(2, '0')}%` : '▶ PLAY'}</span>
        </div>
      </div>
    </div>
  )
}
