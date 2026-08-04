/** The demo clock the sample screens are written against. */
export const NOW = Date.UTC(2026, 7, 3, 9, 15)
const HOUR = 3600_000

/**
 * Shape of the day as a multiplier on current occupancy. A real build would take
 * this from the prediction service; the level it is applied to is live, so the
 * dashboard and the occupancy screen can never disagree about "now".
 */
const CURVE = [
  { hours: -8, factor: 0.84 },
  { hours: -6, factor: 0.88 },
  { hours: -4, factor: 0.93 },
  { hours: -2, factor: 0.97 },
  { hours: 0, factor: 1 },
  { hours: 2, factor: 1.05 },
  { hours: 4, factor: 1.11 },
  { hours: 6, factor: 1.08 },
  { hours: 8, factor: 0.98 },
  { hours: 10, factor: 0.91 },
  { hours: 12, factor: 0.86 },
]

export interface OccupancyPoint {
  hours: number
  time: string
  pct: number
  kind: 'measured' | 'predicted'
}

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

export function buildOccupancySeries(utilisation: number): OccupancyPoint[] {
  return CURVE.map(({ hours, factor }) => ({
    hours,
    time: hhmm(NOW + hours * HOUR),
    pct: Math.min(100, Math.round(utilisation * factor)),
    kind: hours <= 0 ? 'measured' : 'predicted',
  }))
}
