import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  selectNearestBerthByVessel,
  selectVesselAreaIndex,
  swingRadiusM,
} from '../../features/analysis/selectors'
import { selectFeature } from '../../features/selection/selectionSlice'
import { setTab } from '../../features/ui/uiSlice'
import { focusVessel } from '../../features/view/viewSlice'
import {
  formatArea,
  formatDateTime,
  formatDistance,
  hoursBetween,
  minutesBetween,
} from '../../utils/format'
import {
  CARGO_LABELS,
  PURPOSE_AREAS,
  PURPOSE_LABELS,
  SERVICE_LABELS,
} from '../../utils/anchorageRequest'
import { AREA_COLORS } from '../../map/areaColors'
import { flagName } from '../../utils/flags'
import { VESSEL_COLORS, VESSEL_LABELS, VESSEL_STATUS_SHORT } from '../../map/vesselTypes'
import Icon from '../Icon'
import ProximityPanel from '../ProximityPanel'
import RawJson from '../RawJson'

const HISTORY = [
  { at: '03 Aug 04:10', event: 'Anchored', where: 'Anchor Berth 1', note: 'Brought up, 6 shackles' },
  { at: '03 Aug 03:25', event: 'Pilot boarded', where: 'Pilot station', note: 'Pilot Al Rashid' },
  { at: '02 Aug 21:00', event: 'At anchor', where: 'Anchorage Area A', note: 'Awaiting orders' },
  { at: '02 Aug 18:30', event: 'Arrived', where: 'Passage Way', note: 'From Jebel Ali' },
  { at: '28 Jul 07:45', event: 'Departed', where: 'Area BN', note: 'Previous call' },
]

/**
 * Schedule performance the AIS snapshot cannot supply: no vessel carries both
 * an ETA and an ATA, and none carries an ATD at all. Used only where the
 * vessel's own timestamps are missing, so this goes live on its own once the
 * feed fills those fields in.
 */
const SAMPLE_SCHEDULE = {
  eta: '2026-08-05T08:00:00Z',
  ata: '2026-08-05T08:18:00Z',
  etd: '2026-08-05T18:00:00Z',
  atd: '2026-08-05T18:40:00Z',
}

interface Leg {
  planned: string | null
  actual: string | null
  varianceMin: number | null
  verdict: string
  tone: 'ok' | 'warn' | 'alert'
  /** True when the vessel's own timestamps were used, not the stand-ins. */
  live: boolean
}

/**
 * Grades one leg of the call. Anything inside ten minutes either way counts as
 * on time; past half an hour it stops being slippage and becomes a problem.
 */
function gradeLeg(planned?: string | null, actual?: string | null, fallback?: {
  planned: string
  actual: string
}): Leg {
  const live = Boolean(planned && actual)
  const p = planned ?? fallback?.planned ?? null
  const a = actual ?? fallback?.actual ?? null
  const varianceMin = minutesBetween(p, a)

  if (varianceMin == null) {
    return { planned: p, actual: a, varianceMin: null, verdict: 'Not recorded', tone: 'ok', live }
  }
  if (varianceMin <= -10) {
    return { planned: p, actual: a, varianceMin, verdict: 'Early', tone: 'ok', live }
  }
  if (varianceMin <= 10) {
    return { planned: p, actual: a, varianceMin, verdict: 'On time', tone: 'ok', live }
  }
  return {
    planned: p,
    actual: a,
    varianceMin,
    verdict: 'Delayed',
    tone: varianceMin > 30 ? 'alert' : 'warn',
    live,
  }
}

/** Stand-in voyage details for AIS contacts that came without a filed request. */
const SAMPLE_VOYAGE = {
  lastPort: 'AEJEA — Jebel Ali',
  nextPort: 'INNSA — Nhava Sheva',
  agent: 'Gulf Marine Services LLC',
}

export default function VesselDetailsScreen() {
  const dispatch = useAppDispatch()
  const index = useAppSelector(selectVesselAreaIndex)
  const nearest = useAppSelector(selectNearestBerthByVessel)
  const selected = useAppSelector((s) => s.selection.selected)
  const swingFactor = useAppSelector((s) => s.analysis.swingFactor)
  const safetyMarginM = useAppSelector((s) => s.analysis.safetyMarginM)

  const entry =
    index.find((e) => selected?.layer === 'vessels' && e.vessel.properties.id === selected.id) ??
    index[0]

  if (!entry) return <p className="muted">No vessel data loaded.</p>

  const p = entry.vessel.properties
  const berth = nearest[p.id]
  const req = p.request
  const voyage = {
    lastPort: req?.lastPort ?? SAMPLE_VOYAGE.lastPort,
    nextPort: req?.nextPort ?? SAMPLE_VOYAGE.nextPort,
    agent: req?.agent ?? SAMPLE_VOYAGE.agent,
  }

  const anchorage = entry.areas.find((a) => a.properties.category === 'anchorage')
  const otherAreas = entry.areas.filter((a) => a.properties.category !== 'anchorage')
  const swingR = swingRadiusM(p.lengthM, swingFactor, safetyMarginM)
  const dwell = hoursBetween(p.ata, p.etd)
  const [lon, lat] = entry.vessel.geometry.coordinates

  const arrival = gradeLeg(p.eta, p.ata, {
    planned: SAMPLE_SCHEDULE.eta,
    actual: SAMPLE_SCHEDULE.ata,
  })
  const departure = gradeLeg(p.etd, p.atd, {
    planned: SAMPLE_SCHEDULE.etd,
    actual: SAMPLE_SCHEDULE.atd,
  })
  const legs = [
    { key: 'arrival', title: 'Arrival', plannedLabel: 'ETA', actualLabel: 'ATA', leg: arrival },
    { key: 'departure', title: 'Departure', plannedLabel: 'ETD', actualLabel: 'ATD', leg: departure },
  ]
  /** Worst of the two drives the panel's headline badge. */
  const worst: 'ok' | 'warn' | 'alert' =
    arrival.tone === 'alert' || departure.tone === 'alert'
      ? 'alert'
      : arrival.tone === 'warn' || departure.tone === 'warn'
        ? 'warn'
        : 'ok'

  const payload = {
    vessel: { ...p, position: { lon, lat } },
    voyage: { ...voyage, eta: p.eta ?? null, ata: p.ata ?? null, etd: p.etd ?? null },
    assignment: {
      area: anchorage?.properties.code ?? null,
      nearestBerth: berth?.berth.properties.name ?? null,
      distanceM: berth ? Math.round(berth.distanceM) : null,
      swingRadiusM: Math.round(swingR),
      inAreas: entry.areas.map((a) => a.properties.name),
    },
    request: req ?? null,
    history: HISTORY,
  }

  return (
    <div className="vessel-layout">
      {/* ---------------- identity ---------------- */}
      <section className="panel panel-wide">
        <div className="vessel-hero">
          <span className="vessel-hero-mark" style={{ background: VESSEL_COLORS[p.type] }}>
            <Icon name="vessel" size={20} />
          </span>

          <div className="vessel-hero-id">
            <h2>{p.name}</h2>
            <p className="muted">
              {VESSEL_LABELS[p.type]} · IMO {p.imo} · {flagName(p.flag)} flag
              {req?.callSign ? ` · ${req.callSign}` : ''}
              {req?.mmsi ? ` · MMSI ${req.mmsi}` : ''}
            </p>
            <div className="vessel-hero-chips">
              <span className={`pill pill-${p.status}`}>{VESSEL_STATUS_SHORT[p.status]}</span>
              {anchorage && (
                <span
                  className="area-chip"
                  style={{ borderColor: AREA_COLORS[anchorage.properties.code] }}
                >
                  <span
                    className="area-chip-dot"
                    style={{ background: AREA_COLORS[anchorage.properties.code] }}
                  />
                  Area {anchorage.properties.code}
                </span>
              )}
              {req?.hazardous && (
                <span className="hazard-chip">
                  Hazardous{req.imoClass ? ` · IMDG ${req.imoClass.split(' ')[0]}` : ''}
                </span>
              )}
            </div>
          </div>

          <div className="vessel-hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                dispatch(selectFeature({ layer: 'vessels', id: p.id }))
                dispatch(focusVessel(p.id))
                dispatch(setTab('tracking'))
              }}
            >
              Track on map
            </button>
            {p.status === 'awaiting' && (
              <button type="button" onClick={() => dispatch(setTab('assignment'))}>
                Assign anchorage
              </button>
            )}
          </div>
        </div>
      </section>


      <div className="vessel-col">
        {/* ---------------- particulars ---------------- */}
        <section className="panel">
          <h2>Particulars</h2>
          <dl className="kv">
            <div>
              <dt>Length (LOA)</dt>
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
            <div>
              <dt>DWT</dt>
              <dd>{req?.dwtT ? `${req.dwtT.toLocaleString()} t` : '—'}</dd>
            </div>
          </dl>

          <div className="swing-box">
            <div className="swing-head">
              <span>Swing circle — the spot it occupies</span>
              <strong>{Math.round(swingR)} m</strong>
            </div>
            <dl className="swing-kv">
              <div>
                <dt>Radius</dt>
                <dd>{Math.round(swingR)} m</dd>
              </div>
              <div>
                <dt>Diameter</dt>
                <dd>{Math.round(swingR * 2)} m</dd>
              </div>
              <div>
                <dt>Cable out</dt>
                <dd>{Math.round(p.lengthM * (swingFactor - 1))} m</dd>
              </div>
              <div>
                <dt>Factor</dt>
                <dd>×{swingFactor}</dd>
              </div>
              <div>
                <dt>Margin</dt>
                <dd>{safetyMarginM} m</dd>
              </div>
              <div>
                <dt>Swept area</dt>
                <dd>{formatArea(Math.PI * swingR * swingR)}</dd>
              </div>
            </dl>
          </div>
        </section>


        {/* ---------------- position ---------------- */}
        <section className="panel">
          <h2>Position &amp; area</h2>
          <dl className="kv kv-wide">
            <div>
              <dt>Anchorage area</dt>
              <dd>{anchorage ? anchorage.properties.name : 'Outside declared areas'}</dd>
            </div>
            <div>
              <dt>Also inside</dt>
              <dd>{otherAreas.map((a) => a.properties.name).join(', ') || 'None'}</dd>
            </div>
            <div>
              <dt>Nearest anchor berth</dt>
              <dd>{berth ? berth.berth.properties.name : '—'}</dd>
            </div>
            <div>
              <dt>Distance to berth</dt>
              <dd>{berth ? formatDistance(berth.distanceM) : '—'}</dd>
            </div>
            <div>
              <dt>Latitude</dt>
              <dd>{lat.toFixed(5)}°N</dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd>{lon.toFixed(5)}°E</dd>
            </div>
          </dl>
        </section>


        {/* ---------------- schedule performance ---------------- */}
        <section className="panel">
          <h2>
            Schedule performance
            <span className={`badge badge-${worst}`}>
              {worst === 'ok' ? 'on schedule' : 'delayed'}
            </span>
          </h2>

          <div className="sched-grid">
            {legs.map(({ key, title, plannedLabel, actualLabel, leg }) => (
              <div key={key} className={`sched-leg sched-${leg.tone}`}>
                <div className="sched-head">
                  <span className="sched-title">{title}</span>
                  <span className={`pill sched-pill-${leg.tone}`}>{leg.verdict}</span>
                </div>
                <dl className="sched-rows">
                  <div>
                    <dt>{plannedLabel}</dt>
                    <dd>{formatDateTime(leg.planned)}</dd>
                  </div>
                  <div>
                    <dt>{actualLabel}</dt>
                    <dd>{formatDateTime(leg.actual)}</dd>
                  </div>
                  <div className="sched-variance">
                    <dt>Variance</dt>
                    <dd>
                      {leg.varianceMin == null
                        ? '—'
                        : `${leg.varianceMin > 0 ? '+' : ''}${leg.varianceMin} min`}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          {(!arrival.live || !departure.live) && (
            <p className="muted hint">
              {!arrival.live && !departure.live
                ? 'Both legs shown from sample timings'
                : !arrival.live
                  ? 'Arrival shown from sample timings'
                  : 'Departure shown from sample timings'}{' '}
              — the AIS feed carries no matching ETA/ATA pair or actual departure yet.
            </p>
          )}
        </section>

      </div>

      <div className="vessel-col">
        <section className="panel">
          <h2>
            Voyage &amp; call
            {!req && <span className="badge badge-ok">AIS</span>}
          </h2>
          <dl className="kv kv-wide">
            <div>
              <dt>Last port</dt>
              <dd>{voyage.lastPort}</dd>
            </div>
            <div>
              <dt>Next port</dt>
              <dd>{voyage.nextPort}</dd>
            </div>
            <div>
              <dt>ETA</dt>
              <dd>{formatDateTime(p.eta)}</dd>
            </div>
            <div>
              <dt>ATA</dt>
              <dd>{formatDateTime(p.ata)}</dd>
            </div>
            <div>
              <dt>ETD</dt>
              <dd>{formatDateTime(p.etd)}</dd>
            </div>
            <div>
              <dt>Dwell</dt>
              <dd>{dwell == null ? '—' : `${dwell} h`}</dd>
            </div>
            <div className="kv-span">
              <dt>Shipping agent</dt>
              <dd>{voyage.agent}</dd>
            </div>
          </dl>

          {req && (
            <>
              <h3 className="sub-head">Purpose of call</h3>
              <div className="purpose-summary">
                <strong>{PURPOSE_LABELS[req.purpose]}</strong>
                <span className="purpose-areas">
                  {(PURPOSE_AREAS[req.purpose] ?? []).map((code) => (
                    <span key={code} className="area-chip" style={{ borderColor: AREA_COLORS[code] }}>
                      <span className="area-chip-dot" style={{ background: AREA_COLORS[code] }} />
                      {code}
                    </span>
                  ))}
                </span>
              </div>
              {(req.terminal || req.berth || req.spmNumber) && (
                <p className="muted hint">
                  Destination:{' '}
                  {[req.terminal, req.berth, req.spmNumber && `SPM ${req.spmNumber}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </>
          )}
        </section>


        {/* ---------------- cargo & services, only for filed requests ---------------- */}
        {req && (
          <section className="panel">
            <h2>
              Cargo &amp; services
              {req.hazardous && <span className="badge badge-alert">hazardous</span>}
            </h2>
            <dl className="kv kv-wide">
              <div>
                <dt>Cargo type</dt>
                <dd>{CARGO_LABELS[req.cargoType]}</dd>
              </div>
              <div>
                <dt>Cargo</dt>
                <dd>{req.cargoName || '—'}</dd>
              </div>
              <div>
                <dt>IMDG class</dt>
                <dd>{req.imoClass ?? '—'}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>{req.quantityT ? `${req.quantityT.toLocaleString()} t` : '—'}</dd>
              </div>
            </dl>

            {req.hazardous && (
              <p className="override-warning">
                Hazardous cargo declared — separation from neighbouring vessels and area eligibility
                must be confirmed by the Harbour Master before assignment.
              </p>
            )}

            <h3 className="sub-head">Requested services</h3>
            {req.services.length ? (
              <div className="service-chips">
                {req.services.map((s) => (
                  <span key={s} className="service-chip">
                    {SERVICE_LABELS[s] ?? s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">No services requested.</p>
            )}

            <p className="muted hint">Request filed {formatDateTime(req.submittedAt)}.</p>
          </section>
        )}

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
      </div>

      <RawJson label={`GET /api/vessels/${p.id}`} data={payload} />
    </div>
  )
}
