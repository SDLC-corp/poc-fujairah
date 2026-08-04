import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { selectNearestBerthByVessel, selectVesselAreaIndex } from '../../features/analysis/selectors'
import { selectFeature } from '../../features/selection/selectionSlice'
import { setTab } from '../../features/ui/uiSlice'
import { formatDistance } from '../../utils/format'
import ProximityPanel from '../ProximityPanel'
import RawJson from '../RawJson'
import { VESSEL_COLORS, VESSEL_LABELS } from '../../map/vesselTypes'

const HISTORY = [
  { at: '03 Aug 04:10', event: 'Anchored', where: 'Anchor Berth 1', note: 'Brought up, 6 shackles' },
  { at: '03 Aug 03:25', event: 'Pilot boarded', where: 'Pilot station', note: 'Pilot Al Rashid' },
  { at: '02 Aug 21:00', event: 'At anchor', where: 'Anchorage Area A', note: 'Awaiting orders' },
  { at: '02 Aug 18:30', event: 'Arrived', where: 'Passage Way', note: 'From Jebel Ali' },
  { at: '28 Jul 07:45', event: 'Departed', where: 'Area BN', note: 'Previous call' },
]

export default function VesselDetailsScreen() {
  const dispatch = useAppDispatch()
  const index = useAppSelector(selectVesselAreaIndex)
  const nearest = useAppSelector(selectNearestBerthByVessel)
  const selected = useAppSelector((s) => s.selection.selected)

  const entry =
    index.find((e) => selected?.layer === 'vessels' && e.vessel.properties.id === selected.id) ??
    index[0]

  if (!entry) return <p className="muted">No vessel data loaded.</p>

  const p = entry.vessel.properties
  const berth = nearest[p.id]

  const payload = {
    vessel: {
      ...p,
      position: {
        lon: entry.vessel.geometry.coordinates[0],
        lat: entry.vessel.geometry.coordinates[1],
      },
    },
    voyage: {
      lastPort: 'AEJEA — Jebel Ali',
      nextPort: 'INNSA — Nhava Sheva',
      ata: '2026-08-02T18:30:00Z',
      etd: '2026-08-03T18:40:00Z',
      agent: 'Gulf Marine Services LLC',
    },
    assignment: {
      spot: berth?.berth.properties.name ?? null,
      distanceM: berth ? Math.round(berth.distanceM) : null,
      inAreas: entry.areas.map((a) => a.properties.name),
    },
    history: HISTORY,
  }

  return (
    <>
      <section className="panel">
        <h2>Vessel details</h2>
        <div className="vessel-head">
          <span className="dot" style={{ background: VESSEL_COLORS[p.type] }} />
          <div>
            <strong>{p.name}</strong>
            <span className="muted">
              IMO {p.imo} · {p.flag} flag
            </span>
          </div>
          <span className={`pill pill-${p.status}`}>{p.status}</span>
        </div>

        <dl className="kv">
          <div>
            <dt>Type</dt>
            <dd>{VESSEL_LABELS[p.type]}</dd>
          </div>
          <div>
            <dt>LOA</dt>
            <dd>{p.lengthM} m</dd>
          </div>
          <div>
            <dt>Beam</dt>
            <dd>{p.beamM} m</dd>
          </div>
          <div>
            <dt>Draft</dt>
            <dd>{p.draftM} m</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd>{p.speedKn} kn</dd>
          </div>
          <div>
            <dt>Heading</dt>
            <dd>{p.headingDeg}°</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>Arrival &amp; departure</h2>
        <dl className="kv kv-wide">
          <div>
            <dt>Last port</dt>
            <dd>AEJEA — Jebel Ali</dd>
          </div>
          <div>
            <dt>ATA</dt>
            <dd>02 Aug 18:30</dd>
          </div>
          <div>
            <dt>ETD</dt>
            <dd>03 Aug 18:40</dd>
          </div>
          <div>
            <dt>Nearest anchor berth</dt>
            <dd>
              {berth ? `${berth.berth.properties.name} · ${formatDistance(berth.distanceM)}` : '—'}
            </dd>
          </div>
          <div>
            <dt>Area</dt>
            <dd>
              {entry.areas.map((a) => a.properties.name).join(', ') || 'Outside declared areas'}
            </dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd>Gulf Marine Services</dd>
          </div>
        </dl>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            // Assignment is the only screen carrying the map.
            dispatch(selectFeature({ layer: 'vessels', id: p.id }))
            dispatch(setTab('assignment'))
          }}
        >
          Show on map
        </button>
      </section>

      {/* Live Turf analysis for whichever vessel is selected. */}
      <ProximityPanel />

      <section className="panel">
        <h2>Movement history</h2>
        <ol className="timeline">
          {HISTORY.map((h) => (
            <li key={h.at}>
              <span className="timeline-dot" />
              <div>
                <strong>{h.event}</strong> · {h.where}
                <span className="muted">
                  {h.at} — {h.note}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <RawJson label={`GET /api/vessels/${p.id}`} data={payload} />
    </>
  )
}
