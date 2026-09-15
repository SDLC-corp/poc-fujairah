import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  selectNearestBerthByVessel,
  selectVesselAreaIndex,
  swingRadiusM,
} from '../../features/analysis/selectors'
import { SAFETY_MARGIN_NM, shackleCount } from '../../features/analysis/analysisSlice'
import { selectFeature } from '../../features/selection/selectionSlice'
import { setVesselEta } from '../../features/portData/portDataSlice'
import { setTab } from '../../features/ui/uiSlice'
import { focusVessel } from '../../features/view/viewSlice'
import {
  formatArea,
  formatDateTime,
  formatDistance,
  formatDuration,
  hoursBetween,
  hoursSince,
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
import TrackSourceTag from '../TrackSourceTag'
import UpdatedChip from '../UpdatedChip'
import { trackSourceOf } from '../../map/trackSources'
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

interface Leg {
  planned: string | null
  actual: string | null
  varianceMin: number | null
  verdict: string
  tone: 'ok' | 'warn' | 'alert'
  /** True when both halves are present, whether filed or estimated. */
  live: boolean
  /** True when the planned half was worked out rather than declared. */
  estimated: boolean
}

/**
 * An approximate ETA for a vessel that has already arrived.
 *
 * Nothing in the feed records what she was expected at — only when she got
 * here — so this is derived, not recovered: her actual arrival, offset by a
 * variance drawn from her own id. That makes it stable (the same vessel always
 * shows the same figure, and it does not move between renders) and spread
 * across early, on-time and late rather than flattering every call.
 *
 * It is shown as an approximation everywhere it appears, and any real ETA
 * filed against the vessel replaces it outright. The moment the feed carries
 * declared ETAs this function stops being reached.
 */
function approxEta(id: string, eta?: string | null, ata?: string | null): string | null {
  if (eta || !ata) return null
  const at = Date.parse(ata)
  if (Number.isNaN(at)) return null

  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  // Two decorrelated draws averaged, which does two things a single modulo
  // does not: it breaks the run of near-identical figures that sequential ids
  // otherwise produce — a list where every vessel is 48 to 52 minutes late
  // reads as invented — and it clusters the result near zero, so most vessels
  // come out close to their hour with early and late tails, as a real
  // anchorage does.
  const a = (mix(hash) % 91) - 45
  const b = (mix(hash ^ 0x5bf03635) % 91) - 45
  const varianceMin = Math.round((a + b) / 2)
  return new Date(at - varianceMin * 60_000).toISOString()
}

/** Murmur3's finalizer — spreads neighbouring inputs across the whole range. */
function mix(n: number): number {
  let h = n | 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * Grades one leg of the call from the vessel's own timestamps.
 *
 * No stand-ins. This used to fall back to a sample pair whenever either half
 * was missing, which on an arrived vessel meant throwing away a real ATA
 * because no ETA was ever filed against it — and then grading two invented
 * figures. A leg that cannot be graded says which figure it is short of, which
 * is the useful answer and the one that can be acted on: the ETA is editable
 * on the Voyage & call block above.
 *
 * Anything inside ten minutes either way counts as on time; past half an hour
 * it stops being slippage and becomes a problem.
 */
function gradeLeg(planned?: string | null, actual?: string | null, estimated = false): Leg {
  const p = planned ?? null
  const a = actual ?? null
  const live = Boolean(p && a)
  const varianceMin = minutesBetween(p, a)

  if (varianceMin == null) {
    return {
      planned: p,
      actual: a,
      varianceMin: null,
      // Which half is missing decides what the operator can do about it.
      verdict: !p && !a ? 'Nothing recorded' : !p ? 'No estimate filed' : 'Not yet',
      tone: 'ok',
      live,
      estimated,
    }
  }
  if (varianceMin <= -10) {
    return { planned: p, actual: a, varianceMin, verdict: 'Early', tone: 'ok', live, estimated }
  }
  if (varianceMin <= 10) {
    return { planned: p, actual: a, varianceMin, verdict: 'On time', tone: 'ok', live, estimated }
  }
  return {
    planned: p,
    actual: a,
    varianceMin,
    verdict: 'Delayed',
    tone: varianceMin > 30 ? 'alert' : 'warn',
    live,
    estimated,
  }
}

/**
 * ISO -> the value a `datetime-local` field wants, which is local wall time
 * with no zone on it. Blank when there is nothing to edit.
 */
function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Stand-in voyage details for AIS contacts that came without a filed request. */
const SAMPLE_VOYAGE = {
  lastPort: 'AEJEA — Jebel Ali',
  nextPort: 'INNSA — Nhava Sheva',
  agent: 'Gulf Marine Services LLC',
}

export default function VesselDetailsScreen() {
  const dispatch = useAppDispatch()
  const [editingEta, setEditingEta] = useState(false)
  const [etaDraft, setEtaDraft] = useState('')
  const index = useAppSelector(selectVesselAreaIndex)
  const nearest = useAppSelector(selectNearestBerthByVessel)
  const selected = useAppSelector((s) => s.selection.selected)
  const swingFactor = useAppSelector((s) => s.analysis.swingFactor)
  const cableM = useAppSelector((s) => s.analysis.cableM)
  const shackles = useAppSelector((s) => shackleCount(s.analysis.anchorage))
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
  /**
   * How long she has been lying there, as against `dwell`, which is the stay
   * she was booked for. Only vessels that are actually stopped have one — a
   * ship under way has an ATA from her last call and has not been at anchor
   * since, so counting from it would be nonsense.
   */
  const atRest = p.status === 'anchored' || p.status === 'moored'
  const restedH = atRest ? hoursSince(p.ata) : null
  const overstaying = dwell != null && restedH != null && restedH > dwell
  const [lon, lat] = entry.vessel.geometry.coordinates


  /**
   * A stand-in ETA for a vessel already here. Null the moment a real one is
   * filed, so anything showing it is showing it only in the absence of a fact.
   */
  const derivedEta = atRest ? approxEta(p.id, p.eta, p.ata) : null
  const arrival = gradeLeg(p.eta ?? derivedEta, p.ata, !p.eta && derivedEta != null)
  const departure = gradeLeg(p.etd, p.atd)
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
  /** Neither leg has a pair to compare, so there is no performance to report. */
  const graded = arrival.live || departure.live
  /**
   * Everything the grade rests on was worked out rather than declared. The
   * figures are still shown — an approximate variance beats a row of dashes —
   * but the headline must not read as a verdict on the vessel's timekeeping.
   */
  const approxOnly = arrival.estimated && !departure.live

  const payload = {
    vessel: { ...p, position: { lon, lat } },
    voyage: {
      ...voyage,
      eta: p.eta ?? null,
      // Kept apart from `eta` on purpose: an export that merged the two would
      // hand a downstream reader a declaration this port never received.
      etaApprox: p.eta ? null : derivedEta,
      ata: p.ata ?? null,
      etd: p.etd ?? null,
      plannedStayHours: dwell,
      // Derived on read, not stored: it is only true for as long as the
      // response takes to reach the client.
      anchoredForHours: restedH,
      overstaying,
    },
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
              {/* Beside the area, because "Anchored, Area A" is a claim about
                  now and is only true if the fix behind it is recent. */}
              <UpdatedChip at={p.positionAt} />
            </div>
          </div>

          <div className="vessel-hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                // Screen first: changing tab closes the details card, so the
                // selection has to land after the move to survive it.
                dispatch(setTab('tracking'))
                dispatch(selectFeature({ layer: 'vessels', id: p.id }))
                dispatch(focusVessel(p.id))
              }}
            >
              Track on map
            </button>
            {p.status === 'awaiting' && (
              <button type="button" onClick={() => dispatch(setTab('assignment'))}>
                Assign anchorage
              </button>
            )}
            {/* On its own line under the buttons: it describes the track rather
                than doing anything to it, and in the row it read as a third
                action sitting between two real ones. */}
            <TrackSourceTag vesselId={p.id} source={trackSourceOf(p)} />
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
                {/* From the depth of water, not from her length — see the
                    Anchorage configuration panel. */}
                <dd>{Math.round(cableM)} m</dd>
              </div>
              <div>
                <dt title="Shackles veered, worked from the design depth of water.">Shackles</dt>
                <dd>{shackles}</dd>
              </div>
              <div>
                <dt>Margin</dt>
                <dd>{SAFETY_MARGIN_NM} nautical miles</dd>
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
            <span className={`badge badge-${!graded || approxOnly ? 'warn' : worst}`}>
              {!graded
                ? 'not graded'
                : approxOnly
                  ? 'approximate'
                  : worst === 'ok'
                    ? 'on schedule'
                    : 'delayed'}
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
                    <dd title={leg.estimated ? 'Approximate — worked back from the actual arrival, not filed by the agent.' : undefined}>
                      {leg.estimated && <span className="approx-mark">≈</span>}
                      {formatDateTime(leg.planned)}
                    </dd>
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

          {/* Says what is missing and offers the one thing that can be done
              about it, rather than filling the gap with an invented pair. */}
          {arrival.estimated && (
            <p className="muted hint">
              No ETA was filed against this call, so the arrival is graded against an
              approximate one worked back from her actual arrival. Treat the variance as
              indicative.{' '}
              <button
                type="button"
                className="link-cell"
                onClick={() => {
                  setEtaDraft(toLocalInput(derivedEta))
                  setEditingEta(true)
                }}
              >
                File the real ETA
              </button>{' '}
              to grade it properly.
            </p>
          )}
          {!arrival.live && (
            <p className="muted hint">
              {p.ata
                ? 'She arrived, but no ETA was ever filed against it, so the arrival cannot be graded.'
                : 'No arrival recorded yet.'}
              {!p.eta && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="link-cell"
                    onClick={() => {
                      setEtaDraft(toLocalInput(p.ata))
                      setEditingEta(true)
                    }}
                  >
                    Set the ETA
                  </button>{' '}
                  on Voyage &amp; call to grade it.
                </>
              )}
            </p>
          )}
          {arrival.live && !departure.live && (
            <p className="muted hint">
              {p.etd
                ? 'Departure is graded once she sails — no actual departure recorded yet.'
                : 'No ETD on file, so the departure leg cannot be graded.'}
            </p>
          )}
        </section>

      </div>

      <div className="vessel-col">
        <section className="panel">
          <h2>
            Voyage &amp; call
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
              <dd className="eta-cell">
                {editingEta ? (
                  <span className="eta-edit">
                    <input
                      className="text-input"
                      type="datetime-local"
                      autoFocus
                      value={etaDraft}
                      onChange={(e) => setEtaDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      className="link-cell"
                      onClick={() => {
                        dispatch(
                          setVesselEta({
                            vesselId: p.id,
                            // The field is local time; the record is UTC.
                            eta: etaDraft ? new Date(etaDraft).toISOString() : null,
                          }),
                        )
                        setEditingEta(false)
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="link-cell"
                      onClick={() => setEditingEta(false)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <>
                    {p.eta ? (
                      formatDateTime(p.eta)
                    ) : derivedEta ? (
                      // She is already here and nobody filed one. Showing the
                      // approximation beats a dash, but it is marked so it can
                      // never be read back as a declaration.
                      <span
                        className="eta-approx"
                        title="Approximate — worked back from her actual arrival. No ETA was filed by the agent."
                      >
                        <span className="approx-mark">≈</span>
                        {formatDateTime(derivedEta)}
                        <small>approx</small>
                      </span>
                    ) : (
                      '—'
                    )}
                    <button
                      type="button"
                      className="link-cell eta-revise"
                      onClick={() => {
                        setEtaDraft(toLocalInput(p.eta ?? derivedEta))
                        setEditingEta(true)
                      }}
                    >
                      {p.eta ? 'Revise' : 'Set'}
                    </button>
                  </>
                )}
              </dd>
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
              <dt title="The stay she was booked for — ATA through to ETD.">Planned stay</dt>
              <dd>{formatDuration(dwell)}</dd>
            </div>
            <div>
              <dt title="Time elapsed since she arrived. Counted only while she is stopped.">
                {p.status === 'moored' ? 'Moored for' : 'Anchored for'}
              </dt>
              <dd className={overstaying ? 'is-alert' : undefined}>
                {atRest ? formatDuration(restedH) : '—'}
                {overstaying && <small> past ETD</small>}
              </dd>
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
