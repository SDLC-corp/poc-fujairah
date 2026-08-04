import { useAppSelector } from '../app/hooks'
import type { VesselType } from '../types/gis'

/**
 * Four buckets, not fourteen types: a donut only reads part-to-whole at a
 * glance, and past a handful of segments a table does the job better.
 * Colours are a validated categorical set (CVD-separated, not the map palette).
 */
const BUCKETS: { key: string; label: string; color: string; types: VesselType[] }[] = [
  {
    key: 'tanker',
    label: 'Tankers & gas',
    color: '#1d4ed8',
    types: ['chemicaltanker', 'lngcarrier'],
  },
  { key: 'container', label: 'Container', color: '#06b6d4', types: ['container'] },
  {
    key: 'dry',
    label: 'Dry cargo',
    color: '#a855f7',
    types: ['bulkcarrier', 'generalcargo', 'carcarrier', 'livestockcarrier', 'heavyliftvsl'],
  },
  {
    key: 'service',
    label: 'Service craft',
    color: '#c2410c',
    types: ['crewboat', 'divingsupport', 'dredger', 'cableship', 'landingcraft', 'barge'],
  },
]

const R = 54
const RING = 17
const CX = 70
const CY = 70

function arc(startFraction: number, endFraction: number): string {
  // A hair off a full circle, so a single-bucket fleet still renders as a ring.
  const clamped = Math.min(endFraction, startFraction + 0.9999)
  const a0 = startFraction * 2 * Math.PI - Math.PI / 2
  const a1 = clamped * 2 * Math.PI - Math.PI / 2
  const outer = R
  const inner = R - RING
  const x0 = CX + outer * Math.cos(a0)
  const y0 = CY + outer * Math.sin(a0)
  const x1 = CX + outer * Math.cos(a1)
  const y1 = CY + outer * Math.sin(a1)
  const x2 = CX + inner * Math.cos(a1)
  const y2 = CY + inner * Math.sin(a1)
  const x3 = CX + inner * Math.cos(a0)
  const y3 = CY + inner * Math.sin(a0)
  const large = clamped - startFraction > 0.5 ? 1 : 0
  return `M ${x0} ${y0} A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`
}

export default function FleetMixDonut() {
  const vessels = useAppSelector((s) => s.portData.vessels)
  const fleet = vessels?.features ?? []

  const rows = BUCKETS.map((bucket) => ({
    ...bucket,
    count: fleet.filter((v) => bucket.types.includes(v.properties.type)).length,
  })).filter((row) => row.count > 0)

  const total = rows.reduce((sum, r) => sum + r.count, 0)
  if (total === 0) return null

  let cursor = 0
  const segments = rows.map((row) => {
    const start = cursor
    cursor += row.count / total
    return { ...row, start, end: cursor }
  })

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut" role="img" aria-label="Fleet by vessel class">
        {segments.map((seg) => (
          // A 2px surface-coloured stroke keeps neighbouring segments apart.
          <path
            key={seg.key}
            d={arc(seg.start, seg.end)}
            fill={seg.color}
            stroke="var(--surface)"
            strokeWidth="2"
          >
            <title>{`${seg.label}: ${seg.count} (${Math.round((seg.count / total) * 100)}%)`}</title>
          </path>
        ))}
        <text className="donut-total" x={CX} y={CY - 2} textAnchor="middle">
          {total}
        </text>
        <text className="donut-caption" x={CX} y={CY + 14} textAnchor="middle">
          vessels
        </text>
      </svg>

      <ul className="donut-legend">
        {segments.map((seg) => (
          <li key={seg.key}>
            <span className="legend-swatch-sq" style={{ background: seg.color }} />
            <span className="legend-name">{seg.label}</span>
            <span className="donut-count">{seg.count}</span>
            <span className="donut-pct">{Math.round((seg.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
