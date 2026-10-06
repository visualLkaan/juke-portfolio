import { useEffect, useRef, useState } from 'react'
import type { Project } from '../data/projects'
import { RAIL } from './config'
import { rail, useDvdStore } from './dvdState'
import { isRailLayout } from './layoutMode'
import './DvdRail.css'

/**
 * Mobile: an invisible, natively scrolling strip along the bottom of the screen.
 * The 3D DVDs follow its scroll offset; its buttons handle taps (and give each DVD
 * an accessible label).
 */
export function DvdRail({ projects: all, onSelect }: { projects: Project[]; onSelect: (p: Project) => void }) {
  const side = useDvdStore((s) => s.side)
  const projects = all.filter((p) => p.side === side)
  const [vw, setVw] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onResize = () => setVw({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const active = isRailLayout(vw.w, vw.h)
  // Centre the row when it's shorter than the screen.
  const pad = Math.max(16, (vw.w - projects.length * RAIL.itemPx) / 2)
  rail.pad = pad

  useEffect(() => {
    rail.scroll = ref.current?.scrollLeft ?? 0
  }, [active])

  // A new side starts from its first DVD.
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = 0
    rail.scroll = 0
  }, [side])

  if (!active) return null
  return (
    <div
      ref={ref}
      className="dvd-rail"
      style={{ height: RAIL.heightPx, paddingInline: pad }}
      onScroll={(e) => (rail.scroll = e.currentTarget.scrollLeft)}
    >
      {projects.map((p) => (
        <button
          key={p.slug}
          type="button"
          className="dvd-rail__item"
          style={{ width: RAIL.itemPx }}
          aria-label={`${p.title} — ${p.tagline}`}
          onClick={() => onSelect(p)}
        />
      ))}
    </div>
  )
}
