import { PROJECTS, type Project } from './projects'

// Dev only: ?dvds=N fills the shelf with N test projects (layout check), the last
// one with a very long name.
function devProjects(): Project[] {
  const n = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('dvds')) : 0
  if (!n) return PROJECTS
  return Array.from({ length: Math.min(12, n) }, (_, i) => {
    const p = PROJECTS[i % PROJECTS.length]
    const long = i === n - 1 && n > 1
    return { ...p, slug: `${p.slug}-${i}`, title: long ? 'The Extraordinarily Long Project Name' : p.title }
  })
}

/** The projects on the shelf (normally just PROJECTS). */
export const SHELF_PROJECTS = devProjects()
