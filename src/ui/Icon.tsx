import { FILLED, ICONS, type IconName } from './icons'

/** Inline SVG icon that follows the text colour (`currentColor`) and is 1em by default. */
export function Icon({ name, size = '1em', className }: { name: IconName; size?: number | string; className?: string }) {
  const filled = FILLED.has(name)
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}
