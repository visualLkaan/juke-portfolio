import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { SoundToggle } from '../ui/SoundToggle'
import { FilmOverlay } from '../ui/FilmOverlay'
import { Loader } from '../ui/Loader'
import { SideSwitch } from '../ui/SideSwitch'
import { useDvdStore } from '../dvd/dvdState'
import { useLoad } from '../ui/loadState'
import { DvdRail } from '../dvd/DvdRail'
import { DvdKeys } from '../dvd/DvdKeys'
import type { Project } from '../data/projects'
import { SHELF_PROJECTS } from '../data/shelf'
import { setFlashElement } from '../transitions/flash'
import { useTransition } from '../transitions/transitionStore'
import { jukeApi } from '../juke/jukeApi'
import { playContactOpen } from '../dvd/dvdSounds'

// Heavy parts load on demand: the intro screen shows while three.js downloads.
const Stage3D = lazy(() => import('../scene/Stage3D'))
const ProjectPage = lazy(() => import('./Project').then((m) => ({ default: m.ProjectPage })))
const transitions = () => import('../transitions/insertDvd')

// Contact DVDs (side C) are links, not pages.
const indexOf = (slug: string | null) => SHELF_PROJECTS.findIndex((p) => p.slug === slug && !p.href)

/** A contact DVD: Juke waves it off and the profile opens in a new tab. */
function openContact(p: Project) {
  // Opened straight from the click, so pop-up blockers let it through.
  window.open(p.href, '_blank', 'noopener,noreferrer')
  jukeApi.director?.waveBye(p.jukeExpression)
  playContactOpen(SHELF_PROJECTS.indexOf(p))
}

export default function Home() {
  const navigate = useNavigate()
  const routeSlug = useMatch('/project/:slug')?.params.slug ?? null
  const phase = useTransition((s) => s.phase)
  const pageSlug = useTransition((s) => s.pageSlug)
  const introDone = useLoad((s) => s.introDone)
  // Opening a project link directly skips the intro (the page covers the room).
  const [showIntro] = useState(() => !routeSlug)
  useEffect(() => {
    if (!showIntro) useLoad.getState().set({ introDone: true })
  }, [showIntro])

  const select = useCallback((p: Project) => {
    if (!useLoad.getState().introDone) return
    if (p.href) return openContact(p)
    void transitions().then((m) => m.insertDvd(p, indexOf(p.slug), navigate))
  }, [navigate])
  const eject = useCallback(() => {
    const i = indexOf(useTransition.getState().pageSlug)
    if (i >= 0) void transitions().then((m) => m.ejectDvd(SHELF_PROJECTS[i], i, navigate))
  }, [navigate])

  // The URL can change without a click: a direct link / forward button opens the
  // page straight away (no animation); the back button ejects.
  useEffect(() => {
    const { phase, pageSlug, set } = useTransition.getState()
    if (routeSlug && phase === 'idle') {
      if (indexOf(routeSlug) >= 0) {
        // Put the shelf on that project's side, so ejecting returns it to its place.
        useDvdStore.getState().setSide(SHELF_PROJECTS[indexOf(routeSlug)].side)
        set({ phase: 'open', pageSlug: routeSlug })
      }
      else navigate('/', { replace: true })
    } else if (!routeSlug && phase === 'open' && pageSlug) {
      eject()
    }
  }, [routeSlug, navigate, eject])

  const page = SHELF_PROJECTS[indexOf(pageSlug)]

  return (
    <>
      <Suspense fallback={null}>
        <Stage3D onSelect={select} paused={phase === 'open'} />
      </Suspense>
      <FilmOverlay />
      <DvdRail projects={SHELF_PROJECTS} onSelect={select} />
      {introDone && <SideSwitch />}
      {introDone && <DvdKeys projects={SHELF_PROJECTS} onSelect={select} />}
      <SoundToggle />
      <Suspense fallback={null}>{page && <ProjectPage project={page} onEject={eject} />}</Suspense>
      <div className="flash" ref={setFlashElement} aria-hidden="true" />
      {showIntro && !introDone && <Loader />}
    </>
  )
}
