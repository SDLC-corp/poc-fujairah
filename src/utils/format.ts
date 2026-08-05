export function formatDistance(metres: number): string {
  return metres < 1000
    ? `${metres.toFixed(0)} m`
    : `${(metres / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`
}

export function formatArea(m2: number): string {
  return m2 < 10_000
    ? `${m2.toLocaleString(undefined, { maximumFractionDigits: 0 })} m²`
    : `${(m2 / 10_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`
}

/** e.g. "03 Aug 14:20" — compact enough for a dense table. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

/** Whole minutes between two ISO timestamps, or null if either is missing. */
export function minutesBetween(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 60_000)
}

/** Whole hours between two ISO timestamps, or null if either is missing. */
export function hoursBetween(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 3600_000)
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
