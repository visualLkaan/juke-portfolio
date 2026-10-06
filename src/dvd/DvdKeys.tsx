import { useEffect, useState } from 'react'
import type { Project } from '../data/projects'
import { isRailLayout } from './layoutMode'
import { useDvdStore } from './dvdState'
import { playDvdHover } from './dvdSounds'
import { isLocked } from '../transitions/transitionStore'
import './DvdKeys.css'

/**
 * Keyboard access on desktop: an invisible list of buttons, one per DVD. Tab moves
 * through them — the focused DVD lights up exactly like on hover (and Juke looks
 * at it) — and Enter opens it. (Phones use the DVD row's own buttons.)
 */
export function DvdKeys({ projects: all, onSelect }: { projects: Project[]; onSelect: (p: Project) => void }) {
  const side = useDvdStore((s) => s.side)
  const projects = all.filter((p) => p.side === side)
  const [rail, setRail] = useState(() => isRailLayout(window.innerWidth, window.innerHeight))
  useEffect(() => {
    const onResize = () => setRail(isRailLayout(window.innerWidth, window.innerHeight))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  if (rail) return null

  return (
    <nav className="dvd-keys" aria-label="Projects">
      <ul>
        {projects.map((p) => (
          <li key={p.slug}>
            <button
              type="button"
              aria-label={`${p.title} — ${p.tagline}`}
              onFocus={() => {
                if (isLocked()) return
                useDvdStore.getState().setHovered(p.slug)
                playDvdHover(p, 0.3, all.indexOf(p))
              }}
              onBlur={() => {
                if (useDvdStore.getState().hovered === p.slug) useDvdStore.getState().setHovered(null)
              }}
              onClick={() => onSelect(p)}
            >
              {p.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
