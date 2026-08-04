/** Minimal inline stroke icons — no icon dependency for a PoC. */
const PATHS: Record<string, string> = {
  map: 'M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20',
  dashboard: 'M4 4h7v6H4zM4 14h7v6H4zM14 4h6v10h-6zM14 18h6v2h-6z',
  tracking: 'M12 3v18M4 10h16M6 10a6 6 0 0 0 12 0M4.5 14.5 12 21l7.5-6.5',
  occupancy: 'M4 20V10M9.5 20V5M15 20v-8M20.5 20V8M3 20h18',
  assignment: 'M9 4h6v3H9zM7 6H5v14h14V6h-2M9 12h6M9 16h4',
  vessel: 'M5 14h14l-2 5H7zM7 14V8h10v6M12 8V5M9 11h6',
  reports: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h6M9 16h6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.6M12 17h.01',
}

export default function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name] ?? PATHS.dashboard} />
    </svg>
  )
}
