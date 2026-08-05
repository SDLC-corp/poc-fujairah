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
  // Dashboard metric icons
  anchor: 'M12 7v13M9 10h6M5 14a7 7 0 0 0 14 0M4 14h2M18 14h2M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  underway: 'M3 11 21 3l-8 18-2-8z',
  queue: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  spots: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z',
  available: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 12.3l2.4 2.4 4.6-5.1',
  gauge: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M13.4 10.6 17 7M3.5 18a9 9 0 1 1 17 0',
  alert: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5h.01',
  chevron: 'M9.5 6 15 12l-5.5 6',
  // Anchorage-request service icons
  fuel: 'M4 20V5.5A1.5 1.5 0 0 1 5.5 4h6A1.5 1.5 0 0 1 13 5.5V20M3 20h11M6.5 9h4M16 11h3v5.5a1.5 1.5 0 0 0 3 0V9l-3-3',
  water: 'M12 3.5c3.2 3.6 5.5 6.6 5.5 9.2a5.5 5.5 0 0 1-11 0c0-2.6 2.3-5.6 5.5-9.2z',
  lubeoil: 'M4 18v-6h8l4-3v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8.5 12V8.5H13M17 9l3-3',
  crew: 'M9.5 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3 20a6.5 6.5 0 0 1 13 0M16.5 10a2.75 2.75 0 1 0 0-5.5M17 13.6A5.5 5.5 0 0 1 21 19',
  repairs: 'M14.8 6.2a4 4 0 1 0 3 3l-8.4 8.4a2.1 2.1 0 1 1-3-3z',
  stores: 'M3 8.2 12 4l9 4.2v7.6L12 20l-9-4.2zM3 8.2 12 12.4l9-4.2M12 12.4V20',
  waste: 'M4 7h16M9.5 7V4.8h5V7M6.5 7 7.6 20h8.8L17.5 7M10 11v5.5M14 11v5.5',
  // Oily slops discharged out of the vessel
  desloping: 'M9.5 3.4c2.6 2.9 4.4 5.3 4.4 7.4a4.4 4.4 0 1 1-8.8 0c0-2.1 1.8-4.5 4.4-7.4zM18.5 12v7.5M18.5 19.5l-2.2-2.2M18.5 19.5l2.2-2.2',
  // Traffic movements
  arrival: 'M12 3v11M12 14l-4-4M12 14l4-4M4 20h16',
  departure: 'M12 21V10M12 10 8 14M12 10l4 4M4 4h16',
  schedule: 'M4 6.5h16V20H4zM4 10.5h16M8.5 3.5v4M15.5 3.5v4',
  delay: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3.5 2M18.5 3.5 21 6',
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
