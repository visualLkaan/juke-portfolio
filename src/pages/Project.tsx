import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'
import type { Project as ProjectData } from '../data/projects'
import { renderFrontCover } from '../dvd/coverTexture'
import { ProjectGallery } from './ProjectGallery'
import './Project.css'

const luminance = (hex: string) => {
  const c = new THREE.Color(hex)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}

function useCounter() {
  const [s, setS] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setS((v) => v + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The project page, styled like the screen of a tape deck / DVD player: an LCD
 * strip, chunky transport keys, and the same colour and font as the DVD cover.
 */
export function ProjectPage({ project: p, onEject }: { project: ProjectData; onEject: () => void }) {
  const [cover, setCover] = useState<string | null>(null)
  const [scroll, setScroll] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const time = useCounter()

  useEffect(() => {
    let alive = true
    renderFrontCover(p).then((url) => alive && setCover(url))
    return () => {
      alive = false
    }
  }, [p])

  useEffect(() => {
    // Escape ejects — unless the full-screen image viewer is open (it closes first).
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.lightbox') && onEject()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEject])

  useEffect(() => {
    body.current?.focus()
  }, [])

  useEffect(() => {
    const prev = document.title
    document.title = `${p.title} — Kaan Acar`
    return () => {
      document.title = prev
    }
  }, [p.title])

  const light = luminance(p.color) > 0.36
  const style = {
    '--c': p.color,
    '--ink': light ? '#1a1030' : '#ffffff',
    // Like the cover: light colours keep their own hue, dark ones get a yellow title.
    '--title': light ? p.color : '#ffd84a',
  } as CSSProperties
  const links = [
    { key: 'live', label: 'Live site', icon: '▶', href: p.links.live },
    { key: 'github', label: 'GitHub', icon: '⌘', href: p.links.github },
  ]

  return (
    <div
      className="deck"
      style={style}
      ref={body}
      tabIndex={-1}
      onScroll={(e) => {
        const el = e.currentTarget
        setScroll(el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0)
        if (el.scrollTop > 120) setScrolled(true)
      }}
    >
      <header className="deck__bar">
        <button type="button" className="deck__key deck__eject" onClick={onEject} aria-label="Eject — back to Juke's room">
          <span aria-hidden="true">⏏</span> Eject
        </button>
        <div className="deck__lcd" aria-hidden="true">
          <span className="deck__led" />
          <span>▶ PLAY</span>
          <span className="deck__lcd-title">{p.title.toUpperCase()}</span>
          <span>{time}</span>
        </div>
      </header>

      <main className="deck__screen">
        <section className="deck__hero">
          <div className="deck__cover">
            {cover ? <img src={cover} alt={`${p.title} DVD cover`} /> : <div className="deck__cover-ph" />}
          </div>
          <div className="deck__info">
            <span className="deck__icon" aria-hidden="true">
              {p.icon}
            </span>
            <h1 className="deck__title">{p.title}</h1>
            <p className="deck__tagline">{p.tagline}</p>
            <ul className="deck__tech" aria-label="Disciplines">
              {p.tech.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {links.some((l) => l.href) && (
              <div className="deck__links">
                {links
                  .filter((l) => l.href)
                  .map((l) => (
                    <a key={l.key} className="deck__key deck__key--accent" href={l.href} target="_blank" rel="noreferrer">
                      <span aria-hidden="true">{l.icon}</span> {l.label}
                    </a>
                  ))}
              </div>
            )}
          </div>
        </section>

        <section className="deck__panel">
          <h2>About</h2>
          <p>{p.description}</p>
        </section>

        {p.gallery && p.gallery.length > 0 && <ProjectGallery items={p.gallery} />}
      </main>

      {p.gallery && p.gallery.length > 0 && (
        <button
          type="button"
          className={`scroll-hint${scrolled ? ' is-gone' : ''}`}
          onClick={() => document.querySelector('.gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          tabIndex={scrolled ? -1 : 0}
        >
          <span className="scroll-hint__icon" aria-hidden="true">
            {p.gallery.some((m) => m.type === 'video') ? '▶' : '◆'}
          </span>
          {p.gallery.some((m) => m.type === 'video') ? 'Scroll down to watch the film' : 'Scroll down to see the work'}
          <span className="scroll-hint__arrows" aria-hidden="true">
            <i />
            <i />
          </span>
        </button>
      )}

      <MiniJuke progress={scroll} />
    </div>
  )
}

/** Little Juke in the corner; his eyes follow you down the page. */
function MiniJuke({ progress }: { progress: number }) {
  const [blink, setBlink] = useState(false)
  const [mx, setMx] = useState(0)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true)
        setTimeout(() => setBlink(false), 130)
        loop()
      }, 2000 + Math.random() * 3500)
    }
    loop()
    const onMove = (e: PointerEvent) => setMx((e.clientX / window.innerWidth) * 2 - 1)
    window.addEventListener('pointermove', onMove)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])
  const px = mx * 3.5
  const py = -4 + progress * 8
  const eye = (cx: number) => (
    <g>
      <circle cx={cx} cy={34} r={11} fill="#fbf6ea" stroke="#120c08" strokeWidth={2.5} />
      {blink ? (
        <path d={`M${cx - 8} 34 h16`} stroke="#120c08" strokeWidth={3} strokeLinecap="round" />
      ) : (
        <circle cx={cx + px} cy={34 + py} r={4.6} fill="#120c08" />
      )}
    </g>
  )
  return (
    <div className="mini-juke" aria-hidden="true">
      <svg viewBox="0 0 96 64" width="96" height="64">
        <path d="M30 14 v-8 h36 v8" fill="none" stroke="#120c08" strokeWidth={3} strokeLinejoin="round" />
        <rect x={4} y={14} width={88} height={44} rx={9} fill="#c9a46a" stroke="#120c08" strokeWidth={3} />
        <rect x={38} y={26} width={20} height={14} rx={2} fill="#ff8a2a" stroke="#120c08" strokeWidth={2} />
        {eye(22)}
        {eye(74)}
      </svg>
    </div>
  )
}
