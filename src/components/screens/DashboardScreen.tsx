import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  selectAreaCapacity,
  selectGeofenceBreaches,
  selectRestrictedIncursions,
  selectVesselAreaIndex,
} from '../../features/analysis/selectors'
import { selectFeature } from '../../features/selection/selectionSlice'
import { setTab } from '../../features/ui/uiSlice'
import { AREA_COLORS } from '../../map/areaColors'
import RawJson from '../RawJson'

/** Threshold at which the console raises an occupancy warning. */
const OCCUPANCY_ALERT_PCT = 80

/**
 * Overview of the offshore anchorage: the live map sits beside these panels, and
 * every figure below is derived from the loaded data, not hard-coded.
 */
export default function DashboardScreen() {
  const dispatch = useAppDispatch()
  const vessels = useAppSelector((s) => s.portData.vessels)
  const capacity = useAppSelector(selectAreaCapacity)
  const incursions = useAppSelector(selectRestrictedIncursions)
  const index = useAppSelector(selectVesselAreaIndex)
  const breaches = useAppSelector(selectGeofenceBreaches)

  const fleet = vessels?.features ?? []
  const anchored = fleet.filter((v) => v.properties.status === 'anchored').length
  const underway = fleet.filter((v) => v.properties.status === 'underway').length
  const awaiting = fleet.filter((v) => v.properties.status === 'awaiting').length

  const totalSpots = capacity.reduce((sum, r) => sum + r.capacity, 0)
  const occupied = capacity.reduce((sum, r) => sum + r.occupied, 0)
  const available = Math.max(0, totalSpots - occupied)
  const utilisation = totalSpots ? Math.round((occupied / totalSpots) * 100) : 0
  const busiest = capacity[0]
  // Written state as well as colour, so the meter never depends on hue alone.
  const load =
    utilisation >= 85
      ? { className: 'meter-crit', label: 'Critical' }
      : utilisation >= 70
        ? { className: 'meter-warn', label: 'Busy' }
        : { className: '', label: 'Normal' }
  // Cap the warnings: a busy anchorage would otherwise bury the real alerts.
  const nearFull = capacity
    .filter((r) => r.capacity && r.occupied / r.capacity >= OCCUPANCY_ALERT_PCT / 100)
    .slice(0, 3)

  // "Incoming" traffic: still making way rather than brought up at anchor.
  const incoming = index
    .filter((e) => e.vessel.properties.status === 'underway')
    .slice(0, 3)
    .map((e) => ({
      vessel: e.vessel,
      area: e.areas.find((a) => a.properties.category === 'anchorage')?.properties.code ?? '—',
    }))

  const payload = {
    generatedAt: '2026-08-03T09:15:00Z',
    area: 'Port of Fujairah — offshore anchorage',
    summary: {
      vesselsTracked: fleet.length,
      anchored,
      underway,
      awaitingAssignment: awaiting,
      spots: { total: totalSpots, occupied, available, utilisationPct: utilisation },
    },
    byArea: capacity.map((r) => ({
      code: r.area.properties.code,
      capacity: r.capacity,
      occupied: r.occupied,
      available: r.available,
    })),
    alerts: [
      ...breaches.map((b) => ({
        severity: b.fence.properties.kind === 'exclusion' ? 'high' : 'medium',
        type: 'geofence_breach',
        fence: b.fence.properties.name,
        cause: b.fence.properties.cause,
        vessels: b.vessels.length,
      })),
      ...incursions.map((i) => ({
        severity: 'high',
        type: 'restricted_area_incursion',
        vesselId: i.vessel.properties.id,
        vessel: i.vessel.properties.name,
        area: i.area.properties.name,
      })),
      ...nearFull.map((r) => ({
        severity: 'medium',
        type: 'occupancy_threshold',
        area: r.area.properties.code,
        occupied: r.occupied,
        capacity: r.capacity,
      })),
    ],
  }

  return (
    <>
      <section className="panel">
        <h2>Summary</h2>
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-value">{fleet.length}</span>
            <span className="stat-label">Total vessels</span>
          </div>
          <div className="stat">
            <span className="stat-value">{available}</span>
            <span className="stat-label">Spots available</span>
          </div>
          <div className="stat">
            <span className="stat-value">{occupied}</span>
            <span className="stat-label">Spots occupied</span>
          </div>
          <div className="stat">
            <span className="stat-value">{awaiting}</span>
            <span className="stat-label">Awaiting a spot</span>
          </div>
        </div>

        <div className={`meter ${load.className}`}>
          <div className="meter-head">
            <span>Anchorage utilisation</span>
            <span className="meter-state">{load.label}</span>
            <strong>{utilisation}%</strong>
          </div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${utilisation}%` }} />
          </div>
        </div>
        <p className="muted hint">
          A spot is one non-overlapping swing circle, so capacity ({totalSpots}) follows each area's
          size and the vessels currently in it.
        </p>
      </section>

      <section className="panel">
        <h2>
          Notifications
          <span className={`badge ${incursions.length ? 'badge-alert' : 'badge-ok'}`}>
            {breaches.length + incursions.length + nearFull.length + incoming.length}
          </span>
        </h2>
        <ul className="feed">
          {breaches.map((b) => (
            <li
              key={b.fence.properties.id}
              className={`feed-item ${
                b.fence.properties.kind === 'exclusion' ? 'feed-high' : 'feed-warn'
              }`}
            >
              <span className="feed-tag">
                {b.fence.properties.kind === 'exclusion' ? 'Exclusion' : 'Advisory'}
              </span>
              <div>
                <strong>{b.vessels.length}</strong>{' '}
                {b.vessels.length === 1 ? 'vessel' : 'vessels'} inside{' '}
                <strong>{b.fence.properties.name}</strong> ({b.fence.properties.cause}, Area{' '}
                {b.fence.properties.area})
                <span className="feed-time">geofence · live</span>
              </div>
            </li>
          ))}
          {incursions.map((i) => (
            <li key={i.vessel.properties.id} className="feed-item feed-high">
              <span className="feed-tag">Restricted</span>
              <div>
                <strong>{i.vessel.properties.name}</strong> is inside {i.area.properties.name} —
                anchoring and steaming prohibited
                <span className="feed-time">live</span>
              </div>
            </li>
          ))}
          {nearFull.map((r) => (
            <li key={r.area.properties.id} className="feed-item feed-warn">
              <span className="feed-tag">Occupancy</span>
              <div>
                Occupancy threshold reached in <strong>Area {r.area.properties.code}</strong> —{' '}
                {r.occupied} of {r.capacity} spots ({OCCUPANCY_ALERT_PCT}% limit)
                <span className="feed-time">live</span>
              </div>
            </li>
          ))}
          {incoming.map(({ vessel, area }) => (
            <li key={vessel.properties.id} className="feed-item feed-info">
              <span className="feed-tag">Traffic</span>
              <div>
                <strong>{vessel.properties.name}</strong> under way at {vessel.properties.speedKn} kn
                in Area {area}
                <span className="feed-time">live</span>
              </div>
            </li>
          ))}
          {breaches.length + incursions.length + nearFull.length + incoming.length === 0 && (
            <p className="muted">Nothing to report.</p>
          )}
        </ul>
      </section>

      <section className="panel">
        <h2>Quick actions</h2>
        <div className="action-grid">
          <button
            type="button"
            className="primary"
            onClick={() => dispatch(setTab('assignment'))}
          >
            Assign anchorage{awaiting > 0 ? ` (${awaiting})` : ''}
          </button>
          <button type="button" onClick={() => dispatch(setTab('reports'))}>
            View reports
          </button>
          <button type="button" onClick={() => dispatch(setTab('tracking'))}>
            Track vessels
          </button>
          <button type="button" onClick={() => dispatch(setTab('occupancy'))}>
            Occupancy
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>
          Spots by area
          {busiest && <span className="badge badge-ok">busiest {busiest.area.properties.code}</span>}
        </h2>
        <ul className="bar-list">
          {capacity.map((row) => (
            <li key={row.area.properties.id}>
              <button
                type="button"
                className={`bar-row${row.available === 0 ? ' bar-full' : ''}`}
                onClick={() =>
                  dispatch(selectFeature({ layer: 'anchorages', id: row.area.properties.id }))
                }
              >
                <span
                  className="bar-dot"
                  style={{ background: AREA_COLORS[row.area.properties.code] ?? '#0369a1' }}
                />
                <span className="bar-label">{row.area.properties.code}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${row.capacity ? (row.occupied / row.capacity) * 100 : 0}%` }}
                  />
                </span>
                <span className="bar-value">
                  {row.occupied}/{row.capacity}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <RawJson label="GET /api/dashboard/summary" data={payload} />
    </>
  )
}
