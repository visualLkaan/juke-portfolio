import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { setMasterVolume } from '../audio/engine'
import { playSound } from '../juke/sound'
import { DEFAULT_VOLUME, useJukeStore } from '../juke/useJukeStore'
import './SoundToggle.css'

/**
 * Bottom-right volume control. Sound is on by default at a comfortable level.
 * The speaker mutes / unmutes (back to the last level); the slider opens on hover
 * or focus (tap on phones). The mouse wheel over it also changes the volume.
 */
export function SoundToggle() {
  const volume = useJukeStore((s) => s.volume)
  const setVolume = useJukeStore((s) => s.setVolume)
  const [open, setOpen] = useState(false)
  const lastAudible = useRef(volume > 0 ? volume : DEFAULT_VOLUME)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMasterVolume(volume)
    if (volume > 0) lastAudible.current = volume
  }, [volume])

  // Tap outside closes the slider on touch screens.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const muted = volume === 0
  const pct = Math.round(volume * 100)
  const preview = () => setTimeout(() => playSound('click'), 0)

  return (
    <div
      ref={root}
      className={`volume${open ? ' is-open' : ''}`}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}
      onWheel={(e) => setVolume(volume + (e.deltaY < 0 ? 0.05 : -0.05))}
      style={{ '--vol': `${pct}%` } as CSSProperties}
    >
      <input
        className="volume__slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        aria-label="Volume"
        aria-valuetext={muted ? 'Muted' : `${pct}%`}
        tabIndex={open ? 0 : -1}
        onChange={(e) => setVolume(Number(e.currentTarget.value) / 100)}
        onPointerUp={preview}
        onKeyUp={(e) => e.key.startsWith('Arrow') && preview()}
      />
      <button
        type="button"
        className="volume__button"
        aria-label={muted ? 'Unmute' : 'Mute'}
        aria-pressed={muted}
        title={muted ? 'Sound off' : `Volume ${pct}%`}
        onClick={(e) => {
          // On touch, the first tap just opens the slider.
          if ((e.nativeEvent as PointerEvent).pointerType === 'touch' && !open) {
            setOpen(true)
            return
          }
          setVolume(muted ? lastAudible.current : 0)
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          {muted ? (
            <path d="M16 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <>
              <path d="M16 9.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              {volume > 0.45 && (
                <path d="M18.5 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </>
          )}
        </svg>
      </button>
    </div>
  )
}
