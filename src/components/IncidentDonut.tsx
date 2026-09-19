/**
 * The register at a glance: how bad the open ones are, and how many are done.
 *
 * A donut, which reads part-to-whole only at a glance — so every slice is
 * direct-labelled with its count beside the ring rather than leaving the reader
 * to judge an angle, and the total sits in the hole where it is the one figure
 * that needs no comparison.
 *
 * Drawn as stroked arcs on one circle rather than as wedge paths. A ring of
 * four `stroke-dasharray` segments needs no arc arithmetic, no large-arc flags
 * and no special case for a slice that happens to be the whole circle — the
 * three things that make hand-rolled pie charts break on the data nobody tested.
 */

const TONE_VAR: Record<string, string> = {
  alert: 'var(--alert)',
  warn: 'var(--warn)',
  low: 'var(--muted)',
  ok: 'var(--ok)',
}

export default function IncidentDonut({
  slices,
  total,
}: {
  slices: { key: string; label: string; value: number; tone: string }[]
  total: number
}) {
  const sum = slices.reduce((a, s) => a + s.value, 0)
  const R = 42
  const C = 2 * Math.PI * R

  // Where each arc starts, as a running total. An empty register draws the
  // track and no arcs, rather than dividing by zero and drawing NaN.
  let offset = 0
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const length = sum > 0 ? (s.value / sum) * C : 0
      const arc = { ...s, length, offset }
      offset += length
      return arc
    })

  return (
    <div className="inc-donut">
      <svg viewBox="0 0 110 110" role="img" aria-label={`${total} incidents by severity`}>
        {/* The track, so a register with one slice still reads as a ring. */}
        <circle
          cx="55"
          cy="55"
          r={R}
          fill="none"
          stroke="var(--track)"
          strokeWidth="14"
        />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx="55"
            cy="55"
            r={R}
            fill="none"
            stroke={TONE_VAR[a.tone] ?? 'var(--muted)'}
            strokeWidth="14"
            strokeDasharray={`${a.length} ${C - a.length}`}
            strokeDashoffset={-a.offset}
            // Starts the ring at twelve o'clock, which is where a reader
            // assumes it starts; SVG's own zero is at three.
            transform="rotate(-90 55 55)"
          />
        ))}
        <text x="55" y="52" className="inc-donut-total">
          {total}
        </text>
        <text x="55" y="66" className="inc-donut-word">
          Total
        </text>
      </svg>

      <ul className="inc-donut-key">
        {slices.map((s) => (
          <li key={s.key}>
            <span className="inc-donut-dot" style={{ background: TONE_VAR[s.tone] }} />
            {s.label}
            <strong>{s.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}
