// Line icons on a 24×24 grid (round caps/joins, ~2px stroke). Drawn by hand so
// nothing on the site depends on the phone's emoji font — the same path is used
// in the DOM (<Icon>) and on the canvas DVD covers (Path2D).

const circle = (cx: number, cy: number, r: number) => `M${cx + r} ${cy}a${r} ${r} 0 1 1-${r * 2} 0a${r} ${r} 0 1 1 ${r * 2} 0`

export const ICONS = {
  book: 'M2 5c3-1.3 6.5-1.3 10 1v13c-3.5-2.3-7-2.3-10-1z M22 5c-3-1.3-6.5-1.3-10 1v13c3.5-2.3 7-2.3 10-1z',
  newspaper: 'M4 4h12v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z M16 8h4v10a2 2 0 0 1-2 2 M7 8h6 M7 12h6 M7 16h4',
  scissors: `${circle(6, 6, 3)} ${circle(6, 18, 3)} M8.6 7.6 20 18 M8.6 16.4 20 6`,
  coffee: 'M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M17 10h1.5a2.5 2.5 0 0 1 0 5H17 M8 2.5c-.8 1 .8 2 0 3.5 M12 2.5c-.8 1 .8 2 0 3.5 M3 22h15',
  cloud: 'M7 19a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 17.7 9.5a4.75 4.75 0 0 1 .3 9.5z',
  home: 'M3 11 12 3l9 8 M5 9.5V21h14V9.5 M10 21v-6h4v6',
  type: `M2.5 19 7.5 5l5 14 M4.3 14h6.4 ${circle(18, 15.5, 3)} M21 12v7`,
  ufo: 'M8 10a4 4 0 0 1 8 0 M2 13c0-1.7 4.5-3 10-3s10 1.3 10 3-4.5 3-10 3-10-1.3-10-3z M9 16l-2 5 M15 16l2 5 M12 16.5v4.5',
  banknote: `M2 6h20v12H2z ${circle(12, 12, 3)} M5.5 12h.01 M18.5 12h.01`,
  ball: `${circle(12, 12, 9.5)} M12 8.5l3.3 2.4-1.3 3.9h-4l-1.3-3.9z M12 8.5V2.5 M15.3 10.9l5.6-1.8 M14 14.8l3.5 4.8 M10 14.8l-3.5 4.8 M8.7 10.9 3.1 9.1`,
  heart: 'M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 6.6a4.5 4.5 0 0 1 8 2.9C20 15.2 12 20 12 20z',
  note: `M9 18V5l11-2v13 ${circle(6, 18, 3)} ${circle(17, 16, 3)}`,
  film: 'M4 3h16v18H4z M8 3v18 M16 3v18 M4 8h4 M4 12h4 M4 16h4 M16 8h4 M16 12h4 M16 16h4',
  bubbles: `${circle(8.5, 9.5, 5.5)} ${circle(17.5, 16, 3.5)} ${circle(9.5, 20.5, 1.5)} M6 8a2.5 2.5 0 0 1 2.5-2`,
  camera: `M3 8h4l2-3h6l2 3h4v12H3z ${circle(12, 13.5, 3.5)}`,
  chat: 'M4 5h16v11H9l-5 4z',
  briefcase: 'M3 8h18v12H3z M9 8V5h6v3 M3 13h18',
  mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  // UI glyphs
  play: 'M7 4.5v15l12-7.5z',
  prev: 'M16 5 8 12l8 7',
  next: 'M8 5l8 7-8 7',
  close: 'M6 6l12 12 M18 6 6 18',
  eject: 'M12 4 4 14h16z M4 19h16',
  code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5',
  expand: 'M14 4h6v6 M20 4l-7 7 M10 20H4v-6 M4 20l7-7',
  diamond: 'M12 3l8 9-8 9-8-9z',
} as const

export type IconName = keyof typeof ICONS

/** Glyphs that read as solid shapes rather than outlines. */
export const FILLED: ReadonlySet<IconName> = new Set<IconName>(['play', 'eject', 'diamond'])

const cache = new Map<IconName, Path2D>()

/** Draws icon `name` centred on (x, y), `size` px wide, stroked with the current strokeStyle. */
export function drawIcon(g: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string) {
  let path = cache.get(name)
  if (!path) cache.set(name, (path = new Path2D(ICONS[name])))
  const s = size / 24
  g.save()
  g.translate(x - size / 2, y - size / 2)
  g.scale(s, s)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.lineWidth = 2.2
  g.strokeStyle = color
  g.fillStyle = color
  if (FILLED.has(name)) g.fill(path)
  g.stroke(path)
  g.restore()
}
