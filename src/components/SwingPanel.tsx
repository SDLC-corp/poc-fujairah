import { useAppDispatch, useAppSelector } from '../app/hooks'
import { setSafetyMarginM, setSwingFactor } from '../features/analysis/analysisSlice'

/** Sample average LOA per area — what the allocator would preload per zone. */
const AREA_DEFAULTS = [
  { code: 'D', loa: 215 },
  { code: 'G', loa: 300 },
  { code: 'N', loa: 200 },
  { code: 'S', loa: 250 },
]

/**
 * Swing-radius configuration. The circle a vessel needs is its length times a
 * multiplying factor, plus a margin so two safe areas never touch.
 */
export default function SwingPanel() {
  const dispatch = useAppDispatch()
  const factor = useAppSelector((s) => s.analysis.swingFactor)
  const margin = useAppSelector((s) => s.analysis.safetyMarginM)

  return (
    <>
      <section className="panel">
        <h2>Swing radius parameters</h2>
        <div className="form-row">
          <label>
            Vessel length multiplying factor
            <input
              className="text-input"
              type="number"
              min={1}
              max={6}
              step={0.1}
              value={factor}
              onChange={(e) => dispatch(setSwingFactor(Number(e.target.value) || 1))}
            />
          </label>
          <label>
            Safety margin (metres)
            <input
              className="text-input"
              type="number"
              min={0}
              max={500}
              step={5}
              value={margin}
              onChange={(e) => dispatch(setSafetyMarginM(Number(e.target.value) || 0))}
            />
          </label>
        </div>
        <p className="muted hint">
          Safe-area radius = LOA × factor + margin. A 200 m vessel currently needs{' '}
          <strong>{200 * factor + margin} m</strong>.
        </p>
      </section>

      <section className="panel">
        <h2>Area configuration</h2>
        <p className="muted">Expected average vessel length per area, used to pre-size spots.</p>
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
                <td className="muted">{a.loa * factor + margin} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
