import { useAppSelector } from '../app/hooks'

/** Sample average LOA per area — what the allocator would preload per zone. */
const AREA_DEFAULTS = [
  { code: 'D', loa: 215 },
  { code: 'G', loa: 300 },
  { code: 'N', loa: 200 },
  { code: 'S', loa: 250 },
]

/**
 * What the swing rule works out to per area.
 *
 * The rule itself is set on the Anchorage configuration panel — this is the
 * read-out: the average ship each area is pre-sized for, and the circle that
 * ship ends up needing once the notice's arithmetic has been applied to it.
 */
export default function SwingPanel() {
  const factor = useAppSelector((s) => s.analysis.swingFactor)
  const margin = useAppSelector((s) => s.analysis.safetyMarginM)

  return (
    <>
      <section className="panel">
        <h2>Area configuration</h2>
        <p className="muted">
          Expected average vessel length per area, used to pre-size spots. The radius column is the
          rule from Anchorage configuration applied to it.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Average LOA</th>
              <th>Swing radius</th>
            </tr>
          </thead>
          <tbody>
            {AREA_DEFAULTS.map((a) => (
              <tr key={a.code}>
                <td>
                  <strong>{a.code}</strong>
                </td>
                <td>{a.loa} m</td>
                <td className="muted">{Math.round(a.loa * factor + margin)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
