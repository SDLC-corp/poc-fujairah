import type { OccupancyPoint } from '../utils/occupancyCurve'

const W = 460
const H = 132
const PAD_X = 10
const PAD_TOP = 18
const BASE = H - 20

/** Catmull-Rom through the points, converted to cubic béziers — a smooth swell. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`
  }
  return d
}

/**
 * Occupancy through the day as a single-series area — the form for a trend, and
 * it happens to read as a swell. Measured water is solid, forecast is hatched.
 */
export default function OccupancyWave({ series }: { series: OccupancyPoint[] }) {
  if (series.length === 0) return null

  const step = (W - PAD_X * 2) / (series.length - 1)
  const points = series.map((p, i) => ({
    ...p,
    x: PAD_X + i * step,
    y: PAD_TOP + (1 - p.pct / 100) * (BASE - PAD_TOP),
  }))

  const nowIndex = points.findIndex((p) => p.hours === 0)
  const now = points[nowIndex]
  const line = smoothPath(points)
  const area = `${line} L ${points[points.length - 1].x} ${BASE} L ${points[0].x} ${BASE} Z`

  return (
    <figure className="wave">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Anchorage occupancy through the day">
        <defs>
          <linearGradient id="waveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b56b5" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1b56b5" stopOpacity="0.02" />
          </linearGradient>
          <pattern id="waveForecast" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#eaf1fb" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#bcd3f3" strokeWidth="2.2" />
          </pattern>
          {/* Everything right of "now" is forecast, so it wears the hatch. */}
          <clipPath id="waveAhead">
            <rect x={now.x} y="0" width={W - now.x} height={H} />
          </clipPath>
          <clipPath id="waveBehind">
            <rect x="0" y="0" width={now.x} height={H} />
          </clipPath>
        </defs>

        <line x1="0" y1={BASE} x2={W} y2={BASE} stroke="#d7e0ec" strokeWidth="1" />

        <path d={area} fill="url(#waveFill)" />
        <path d={area} fill="url(#waveForecast)" opacity="0.5" clipPath="url(#waveAhead)" />
        {/* Measured is drawn solid; the projection is dashed, so the two halves
            are told apart by shape and not by fill alone. */}
        <path
          d={line}
          fill="none"
          stroke="#1b56b5"
          strokeWidth="2"
          strokeLinecap="round"
          clipPath="url(#waveBehind)"
        />
        <path
          d={line}
          fill="none"
          stroke="#1b56b5"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="5 4"
          opacity="0.75"
          clipPath="url(#waveAhead)"
        />

        <line
          x1={now.x}
          y1={PAD_TOP - 8}
          x2={now.x}
          y2={BASE}
          stroke="#0a2540"
          strokeWidth="1"
          opacity="0.3"
        />
        <circle cx={now.x} cy={now.y} r="4.5" fill="#1b56b5" stroke="#fff" strokeWidth="2" />
        <text className="wave-now" x={now.x} y={PAD_TOP - 12} textAnchor="middle">
          {now.pct}% now
        </text>

        {points.map((p) => (
          <g key={p.hours}>
            {/* Wider than the mark, so the tooltip is easy to hit. */}
            <rect x={p.x - step / 2} y="0" width={step} height={BASE} fill="transparent">
              <title>{`${p.time} · ${p.pct}% (${p.kind})`}</title>
            </rect>
            <text className="wave-tick" x={p.x} y={H - 4} textAnchor="middle">
              {p.hours % 4 === 0 ? p.time : ''}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="legend">
        <span>
          <i className="legend-swatch" /> Measured
        </span>
        <span>
          <i className="legend-swatch legend-swatch-predicted" /> Forecast
        </span>
      </figcaption>
    </figure>
  )
}
