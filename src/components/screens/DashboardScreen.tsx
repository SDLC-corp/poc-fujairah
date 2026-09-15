import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  selectAreaCapacity,
  selectGeofenceBreaches,
  selectPortTotals,
  selectRestrictedIncursions,
  selectVesselAreaIndex,
} from '../../features/analysis/selectors'
import { highlightFeature, selectFeature } from '../../features/selection/selectionSlice'
import { focusFeature } from '../../features/view/viewSlice'
import type { FocusTarget } from '../../features/view/viewSlice'
import type { LayerId } from '../../types/gis'
import { AREA_COLORS } from '../../map/areaColors'
import { buildOccupancySeries } from '../../utils/occupancyCurve'
import { OCCUPANCY_ALERT_PCT } from '../../utils/occupancyLoad'
import { useState } from 'react'
import { FiMail } from 'react-icons/fi'
import CollapsiblePanel from '../CollapsiblePanel'
import SendIncidentMailDialog from '../SendIncidentMailDialog'
import type { IncidentMail, IncidentSubject } from '../SendIncidentMailDialog'
import FleetMixDonut from '../FleetMixDonut'
import OccupancyWave from '../OccupancyWave'
import PanelFolds from '../PanelFolds'
import RawJson from '../RawJson'

/** The folding panels, in the order they appear — drives "collapse all". */
const PANEL_IDS = ['dash-occupancy', 'dash-fleet', 'dash-alerts', 'dash-spots']

/**
 * What an operator is likely to be reporting, per kind of incident.
 *
 * Kept apart rather than pooled into one list, because the useful answers are
 * not the same: a ship inside a prohibited area is a matter of orders given,
 * while an anchorage at its limit is a matter of what is being done about the
 * queue. A single list covering both would be mostly wrong on every screen.
 */
const REASONS: Record<string, string[]> = {
  geofence: [
    'Vessel ordered to leave the area',
    'Entry permitted — working under escort',
    'Awaiting master response',
    'Cause not yet established',
    'Other',
  ],
  restricted: [
    'Vessel ordered to leave immediately',
    'Vessel in distress — entry unavoidable',
    'Awaiting master response',
    'Reported to the Harbour Master',
    'Other',
  ],
  occupancy: [
    'Arrivals being diverted to another area',
    'Spots being released',
    'No action — short-lived peak',
    'Escalated to the Harbour Master',
    'Other',
  ],
  traffic: [
    'Routine movement — no action',
    'Speed advisory issued',
    'Awaiting master response',
    'Other',
  ],
}

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
   * Jump the map to whatever an alert is reporting: light it up so the
   * highlight follows, and frame it so it lands in view.
   *
   * Highlighted, not opened. "Show on map" is a request to look at the chart,
   * and answering it by dropping a details card over that chart answers a
   * question nobody asked — the map's own focus balloon already names what was
   * revealed. The card is what a click on the feature itself is for.
   */
  function reveal(layer: LayerId, target: FocusTarget, id: string) {
    dispatch(highlightFeature({ layer, id }))
    dispatch(focusFeature({ target, id }))
  }

  /** The incident being reported, and what has been reported already. */
  const [reporting, setReporting] = useState<{ key: string; subject: IncidentSubject } | null>(
    null,
  )
  const [reported, setReported] = useState<Record<string, IncidentMail>>({})

  /**
   * The mail action every feed row carries.
   *
   * Keyed by the row's own id so the confirmation stays with the incident it
   * belongs to — an operator who has reported the geofence breach should not
   * see the occupancy warning claiming it was sent too.
   */
  function mailAction(key: string, subject: IncidentSubject) {
    const sent = reported[key]
    return (
      <>
        <button
          type="button"
          className="feed-mail"
          title={sent ? `Reported to ${sent.to}` : 'Report this by mail'}
          onClick={() => setReporting({ key, subject })}
        >
          <FiMail size={12} aria-hidden="true" />
          {sent ? 'Report again' : 'Send mail'}
        </button>
        {sent && (
          <span className="feed-sent">
            Reported to {sent.to} — {sent.reason}
          </span>
        )}
      </>
    )
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
      <PanelFolds ids={PANEL_IDS} />

      <CollapsiblePanel id="dash-occupancy" title="Occupancy through the day">
        <OccupancyWave series={series} />
      </CollapsiblePanel>

      <CollapsiblePanel id="dash-fleet" title="Fleet by class">
        <FleetMixDonut />
      </CollapsiblePanel>

      <CollapsiblePanel
        id="dash-alerts"
        title="Notifications"
        badge={
          <span className={`badge ${incursions.length ? 'badge-alert' : 'badge-ok'}`}>
            {breaches.length + incursions.length + nearFull.length + incoming.length}
          </span>
        }
      >
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
              {mailAction(`fence-${b.fence.properties.id}`, {
                title: `${b.vessels.length} ${b.vessels.length === 1 ? 'vessel' : 'vessels'} inside ${b.fence.properties.name}`,
                subtitle: `${b.fence.properties.kind === 'exclusion' ? 'Exclusion zone' : 'Advisory zone'} · Area ${b.fence.properties.area} · ${b.fence.properties.cause}`,
                lines: [
                  `Vessels: ${b.vessels.map((v) => v.properties.name).join(', ')}`,
                  `Rule: ${b.fence.properties.rule}`,
                ],
                reasons: REASONS.geofence,
              })}
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
              {mailAction(`restricted-${i.vessel.properties.id}`, {
                title: `${i.vessel.properties.name} — inside ${i.area.properties.name}`,
                subtitle: 'Anchoring and steaming prohibited',
                lines: [
                  `IMO ${i.vessel.properties.imo} · ${i.vessel.properties.lengthM} m LOA · making ${i.vessel.properties.speedKn} kn`,
                  `Authority: ${i.area.properties.authority}`,
                ],
                reasons: REASONS.restricted,
              })}
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
              {mailAction(`occupancy-${r.area.properties.id}`, {
                title: `Area ${r.area.properties.code} — occupancy threshold reached`,
                subtitle: r.area.properties.name,
                lines: [
                  `${r.occupied} of ${r.capacity} spots taken, ${r.available} free.`,
                  `Threshold is ${OCCUPANCY_ALERT_PCT}% of capacity.`,
                ],
                reasons: REASONS.occupancy,
              })}
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
              {mailAction(`traffic-${vessel.properties.id}`, {
                title: `${vessel.properties.name} — under way in the anchorage`,
                subtitle: `Area ${area} · making ${vessel.properties.speedKn} kn`,
                lines: [
                  `IMO ${vessel.properties.imo} · ${vessel.properties.lengthM} m LOA`,
                  `Heading ${vessel.properties.headingDeg}°.`,
                ],
                reasons: REASONS.traffic,
              })}
            </li>
          ))}
          {breaches.length + incursions.length + nearFull.length + incoming.length === 0 && (
            <p className="muted">Nothing to report.</p>
          )}
        </ul>
      </CollapsiblePanel>

      <CollapsiblePanel
        id="dash-spots"
        title="Spots by area"
        badge={
          busiest ? (
            <span className="badge badge-ok">busiest {busiest.area.properties.code}</span>
          ) : null
        }
      >
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
      </CollapsiblePanel>

      {reporting && (
        <SendIncidentMailDialog
          subject={reporting.subject}
          onSend={(mail) => {
            setReported((prev) => ({ ...prev, [reporting.key]: mail }))
            setReporting(null)
          }}
          onClose={() => setReporting(null)}
        />
      )}

      <RawJson label="GET /api/dashboard/summary" data={payload} />
    </>
  )
}
