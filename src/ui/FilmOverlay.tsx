import { useMemo, type CSSProperties } from 'react'
import { ROOM } from '../juke/config'
import './FilmOverlay.css'

/**
 * Film look over the 3D scene, done in CSS so it costs no extra render passes:
 * a warm colour grade, a soft vignette and fine animated grain.
 */
export function FilmOverlay() {
  const grain = useMemo(() => {
    const size = 160
    const cv = document.createElement('canvas')
    cv.width = cv.height = size
    const g = cv.getContext('2d')!
    const img = g.createImageData(size, size)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    return cv.toDataURL('image/png')
  }, [])

  return (
    <div className="film" aria-hidden="true">
      <div className="film__grade" />
      <div className="film__vignette" style={{ '--v': ROOM.vignette } as CSSProperties} />
      <div className="film__grain" style={{ backgroundImage: `url(${grain})`, opacity: ROOM.grain }} />
    </div>
  )
}
