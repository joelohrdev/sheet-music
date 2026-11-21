const PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  previous: 'M15.4 6.4 14 5l-7 7 7 7 1.4-1.4L9.8 12z',
  next: 'M8.6 6.4 10 5l7 7-7 7-1.4-1.4L14.2 12z',
  start: 'M6 5h2v14H6zM20 5v14L9 12z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  minus: 'M5 11h14v2H5z',
  trash: 'M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 11H7z',
  import: 'M11 3h2v9l3-3 1.4 1.4L12 16l-5.4-5.6L8 9l3 3zM5 18h14v2H5z',
} as const

export function Icon({ name, size = 22 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
