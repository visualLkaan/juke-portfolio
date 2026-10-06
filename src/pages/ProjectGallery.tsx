import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { MediaItem } from '../data/projects'
import './ProjectGallery.css'

type Img = Extract<MediaItem, { type: 'image' }>

/**
 * The project's visuals, big: each sits on its own "screen" that tilts gently in
 * 3D under the pointer and settles into place as you scroll to it. Images open in
 * a full-screen viewer (zoom + pan); videos play in place.
 */
export function ProjectGallery({ items }: { items: MediaItem[] }) {
  const images = items.filter((m): m is Img => m.type === 'image')
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section className="gallery" aria-label="Project visuals">
      {items.map((m, i) => (
        <Shot key={m.src} item={m} index={i} onOpen={() => setOpen(images.indexOf(m as Img))} />
      ))}
      {/* Portal: the gallery is transformed, which would trap a fixed overlay inside it. */}
      {open !== null && open >= 0 && createPortal(<Lightbox images={images} start={open} onClose={() => setOpen(null)} />, document.body)}
    </section>
  )
}

function Shot({ item, index, onOpen }: { item: MediaItem; index: number; onOpen: () => void }) {
  const ref = useRef<HTMLElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [visible, setVisible] = useState(false)

  // Settle in when scrolled into view; videos play only while visible.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true)
        const v = video.current
        if (v) {
          if (e.intersectionRatio > 0.35) void v.play().catch(() => {})
          else v.pause()
        }
      },
      { threshold: [0, 0.12, 0.35, 0.6] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Gentle 3D tilt toward the pointer.
  const onMove = (e: RPointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    e.currentTarget.style.setProperty('--ry', `${x * 5}deg`)
    e.currentTarget.style.setProperty('--rx', `${-y * 4}deg`)
    e.currentTarget.style.setProperty('--gx', `${(x + 0.5) * 100}%`)
    e.currentTarget.style.setProperty('--gy', `${(y + 0.5) * 100}%`)
  }
  const onLeave = (e: RPointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty('--ry', '0deg')
    e.currentTarget.style.setProperty('--rx', '0deg')
  }

  const label = `CH ${String(index + 1).padStart(2, '0')}`
  return (
    <figure
      ref={ref}
      className={`shot${visible ? ' is-in' : ''}${item.type === 'video' ? ' shot--video' : ''}`}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <figcaption className="shot__label">
        <span className="shot__ch">{label}</span>
        {item.caption}
      </figcaption>
      <div className="shot__screen" style={{ aspectRatio: `${item.width} / ${item.height}` }}>
        {item.type === 'image' ? (
          <button type="button" className="shot__open" onClick={onOpen} aria-label={`Open “${item.caption}” full screen`}>
            <img
              src={item.src}
              srcSet={item.small ? `${item.small} 1200w, ${item.src} ${item.width}w` : undefined}
              sizes="(max-width: 1400px) 94vw, 1400px"
              width={item.width}
              height={item.height}
              alt={item.caption}
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
            />
            <span className="shot__zoom" aria-hidden="true">⤢</span>
          </button>
        ) : (
          <video
            ref={video}
            src={item.src}
            poster={item.poster}
            width={item.width}
            height={item.height}
            controls
            muted
            loop
            playsInline
            preload="metadata"
          />
        )}
        <span className="shot__glare" aria-hidden="true" />
      </div>
    </figure>
  )
}

/** Full-screen viewer: wheel / pinch / double-click to zoom, drag to pan, arrows to browse. */
function Lightbox({ images, start, onClose }: { images: Img[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d: number; s: number } | null>(null)
  const img = images[i]

  const go = useCallback(
    (d: number) => {
      setI((v) => (v + d + images.length) % images.length)
      setView({ s: 1, x: 0, y: 0 })
    },
    [images.length],
  )

  useEffect(() => {
    // Capture phase + preventDefault so Escape closes the viewer, not the whole page.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    const prev = document.activeElement as HTMLElement | null
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [go, onClose])

  const zoomAt = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      const s = Math.min(6, Math.max(1, v.s * factor))
      if (s === 1) return { s: 1, x: 0, y: 0 }
      // Keep the point under the cursor fixed.
      const k = s / v.s
      return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
    })
  const center = (e: { clientX: number; clientY: number }) => ({ x: e.clientX - window.innerWidth / 2, y: e.clientY - window.innerHeight / 2 })

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={img.caption}>
      <div
        className="lightbox__stage"
        onWheel={(e) => {
          const c = center(e)
          zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, c.x, c.y)
        }}
        onDoubleClick={(e) => {
          const c = center(e)
          if (view.s > 1) setView({ s: 1, x: 0, y: 0 })
          else zoomAt(2.5, c.x, c.y)
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()]
            pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s }
          }
        }}
        onPointerMove={(e) => {
          const last = pointers.current.get(e.pointerId)
          if (!last) return
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pinch.current && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()]
            const s = Math.min(6, Math.max(1, (pinch.current.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d))
            setView((v) => (s === 1 ? { s: 1, x: 0, y: 0 } : { ...v, s }))
          } else if (view.s > 1) {
            setView((v) => ({ ...v, x: v.x + e.clientX - last.x, y: v.y + e.clientY - last.y }))
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId)
          if (pointers.current.size < 2) pinch.current = null
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && view.s === 1) onClose()
        }}
        style={{ cursor: view.s > 1 ? 'grab' : 'zoom-in' }}
      >
        <img
          key={img.src}
          src={img.src}
          alt={img.caption}
          draggable={false}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
        />
      </div>
      <div className="lightbox__bar">
        <span>
          {img.caption} · {i + 1}/{images.length}
        </span>
        <span className="lightbox__hint">Scroll or pinch to zoom · drag to move</span>
      </div>
      {images.length > 1 && (
        <>
          <button type="button" className="lightbox__nav lightbox__nav--prev" onClick={() => go(-1)} aria-label="Previous image">
            ‹
          </button>
          <button type="button" className="lightbox__nav lightbox__nav--next" onClick={() => go(1)} aria-label="Next image">
            ›
          </button>
        </>
      )}
      <button type="button" className="lightbox__close" onClick={onClose} aria-label="Close" autoFocus>
        ✕
      </button>
    </div>
  )
}
