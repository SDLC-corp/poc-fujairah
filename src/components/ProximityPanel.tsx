import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  setBufferRadiusKm,
  setShowBuffer,
  setShowNearestBerthLine,
} from '../features/analysis/analysisSlice'
import {
  selectNearestBerthLine,
  selectProximityResult,
  selectSelectedVessel,
} from '../features/analysis/selectors'
import { selectFeature } from '../features/selection/selectionSlice'
import { formatArea, formatDistance, formatMetres, METRES_PER_NM } from '../utils/format'

/**
 * Buffer + distance + overlap analysis around whichever vessel is selected,
 * all computed client-side with Turf.
 */
export default function ProximityPanel() {
  const dispatch = useAppDispatch()
  const vessel = useAppSelector(selectSelectedVessel)
  const radiusKm = useAppSelector((s) => s.analysis.bufferRadiusKm)
  const showBuffer = useAppSelector((s) => s.analysis.showBuffer)
  const showLine = useAppSelector((s) => s.analysis.showNearestBerthLine)
  const nearest = useAppSelector(selectNearestBerthLine)
  const result = useAppSelector(selectProximityResult)
  const radiusNm = (radiusKm * 1000) / METRES_PER_NM

  if (!vessel) {
    return (
      <section className="panel">
        <h2>Proximity analysis</h2>
        <p className="muted">Select a vessel to run buffer and distance analysis.</p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h2>Proximity analysis</h2>
      <p className="subject">{vessel.properties.name}</p>

      {/* Set in miles like every other distance here, but the slice keeps its
          radius in km because that is what Turf's buffer takes — so the mile is
          converted at this boundary rather than rippling through the analysis. */}
      <label className="slider">
        <span>
          Search radius <strong>{radiusNm.toFixed(2)} NM</strong>
          <span className="muted"> · {formatMetres(radiusKm * 1000)}</span>
        </span>
        <input
          type="range"
          min={0.05}
          max={1.6}
          step={0.05}
          value={radiusNm}
          onChange={(e) =>
            dispatch(setBufferRadiusKm((Number(e.target.value) * METRES_PER_NM) / 1000))
          }
        />
      </label>

      <div className="toggle-row">
        <label>
          <input
            type="checkbox"
            checked={showBuffer}
            onChange={(e) => dispatch(setShowBuffer(e.target.checked))}
          />
          Show buffer
        </label>
        <label>
          <input
            type="checkbox"
            checked={showLine}
            onChange={(e) => dispatch(setShowNearestBerthLine(e.target.checked))}
          />
          Show nearest berth
        </label>
      </div>

      {nearest && (
        <p className="result-line">
          Nearest anchor berth: <strong>{nearest.berth.properties.name}</strong> —{' '}
          {formatDistance(nearest.distanceM)}
        </p>
      )}

      <h3>Vessels in radius ({result?.vessels.length ?? 0})</h3>
      {result?.vessels.length ? (
        <ul className="result-list">
          {result.vessels.map(({ vessel: other, distanceM }) => (
            <li key={other.properties.id}>
              <button
                type="button"
                onClick={() =>
                  dispatch(selectFeature({ layer: 'vessels', id: other.properties.id }))
                }
              >
                <span>{other.properties.name}</span>
                <span className="muted">{formatDistance(distanceM)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No other vessel within the radius.</p>
      )}

      <h3>Anchor berths in radius ({result?.berths.length ?? 0})</h3>
      {result?.berths.length ? (
        <ul className="chip-list">
          {result.berths.map((berth) => (
            <li key={berth.properties.id}>
              <button
                type="button"
                className="chip"
                onClick={() =>
                  dispatch(selectFeature({ layer: 'anchorages', id: berth.properties.id }))
                }
              >
                {berth.properties.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No designated anchor berth inside the radius.</p>
      )}

      <h3>Area coverage</h3>
      {result?.areas.length ? (
        <ul className="result-list">
          {result.areas.map(({ area, overlapM2 }) => (
            <li key={area.properties.id}>
              <button
                type="button"
                onClick={() =>
                  dispatch(selectFeature({ layer: 'anchorages', id: area.properties.id }))
                }
              >
                <span>{area.properties.name}</span>
                <span className="muted">{formatArea(overlapM2)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Radius does not overlap any declared area.</p>
      )}
    </section>
  )
}
