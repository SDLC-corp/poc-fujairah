import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  selectAreaCapacity,
  selectGeofenceBreaches,
  selectPortTotals,
  selectRestrictedIncursions,
  selectVesselAreaIndex,
} from '../../features/analysis/selectors'
import { selectFeature } from '../../features/selection/selectionSlice'
import { focusFeature } from '../../features/view/viewSlice'
import type { FocusTarget } from '../../features/view/viewSlice'
import type { LayerId } from '../../types/gis'
import { AREA_COLORS } from '../../map/areaColors'
import { buildOccupancySeries } from '../../utils/occupancyCurve'
import { OCCUPANCY_ALERT_PCT } from '../../utils/occupancyLoad'
import FleetMixDonut from '../FleetMixDonut'
import OccupancyWave from '../OccupancyWave'
import RawJson from '../RawJson'

/**
 * Overview of the offshore anchorage: the live map sits beside these panels, and
 * every figure below is derived from the loaded data, not hard-coded.
 */
export default function DashboardScreen() {
  const dispatch = useAppDispatch()
  const capacity = useAppSelector(selectAreaCapacity)
  const incursions = useAppSelector(selectRestrictedIncursions)
  const index = useAppSelector(selectVesselAreaIndex)
  const breaches = useAppSelector(selectGeofenceBreaches)
  const totals = useAppSelector(selectPortTotals)

  const {
    byStatus,
    capacity: totalSpots,
    occupied,
    available,
    utilisationPct: utilisation,
  } = totals
  const busiest = capacity[0]
  const series = buildOccupancySeries(utilisation)
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

  /**
   * Jump the map to whatever an alert is reporting: select it so the detail
   * card and highlight follow, and frame it so the popup lands in view.
   */
  function reveal(layer: LayerId, target: FocusTarget, id: string) {
    dispatch(selectFeature({ layer, id }))
    dispatch(focusFeature({ target, id }))
  }

  const payload = {
    generatedAt: '2026-08-03T09:15:00Z',
    area: 'Port of Fujairah — offshore anchorage',
    summary: {
      vesselsTracked: totals.fleet,
      byStatus,
      awaitingAssignment: byStatus.awaiting,
      spots: { total: totalSpots, occupied, available, utilisationPct: utilisation },
    },
    forecast: series.map((p) => ({ time: p.time, utilisationPct: p.pct, kind: p.kind })),
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
        <h2>Occupancy through the day</h2>
        <OccupancyWave series={series} />
      </section>

      <section className="panel">
        <h2>Fleet by class</h2>
        <FleetMixDonut />
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
              <button
                type="button"
                className="feed-go"
                onClick={() => reveal('geofences', 'geofence', b.fence.properties.id)}
              >
                <strong>{b.vessels.length}</strong>{' '}
                {b.vessels.length === 1 ? 'vessel' : 'vessels'} inside{' '}
                <strong>{b.fence.properties.name}</strong> ({b.fence.properties.cause}, Area{' '}
                {b.fence.properties.area})
                <span className="feed-time">geofence · live — show on map</span>
              </button>
            </li>
          ))}
          {incursions.map((i) => (
            <li key={i.vessel.properties.id} className="feed-item feed-high">
              <span className="feed-tag">Restricted</span>
              <button
                type="button"
                className="feed-go"
                onClick={() => reveal('vessels', 'vessel', i.vessel.properties.id)}
              >
                <strong>{i.vessel.properties.name}</strong> is inside {i.area.properties.name} —
                anchoring and steaming prohibited
                <span className="feed-time">live — show on map</span>
              </button>
            </li>
          ))}
          {nearFull.map((r) => (
            <li key={r.area.properties.id} className="feed-item feed-warn">
              <span className="feed-tag">Occupancy</span>
              <button
                type="button"
                className="feed-go"
                onClick={() => reveal('anchorages', 'area', r.area.properties.id)}
              >
                Occupancy threshold reached in <strong>Area {r.area.properties.code}</strong> —{' '}
                {r.occupied} of {r.capacity} spots ({OCCUPANCY_ALERT_PCT}% limit)
                <span className="feed-time">live — show on map</span>
              </button>
            </li>
          ))}
          {incoming.map(({ vessel, area }) => (
            <li key={vessel.properties.id} className="feed-item feed-info">
              <span className="feed-tag">Traffic</span>
              <button
                type="button"
                className="feed-go"
                onClick={() => reveal('vessels', 'vessel', vessel.properties.id)}
              >
                <strong>{vessel.properties.name}</strong> under way at {vessel.properties.speedKn} kn
                in Area {area}
                <span className="feed-time">live — show on map</span>
              </button>
            </li>
          ))}
          {breaches.length + incursions.length + nearFull.length + incoming.length === 0 && (
            <p className="muted">Nothing to report.</p>
          )}
        </ul>
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
