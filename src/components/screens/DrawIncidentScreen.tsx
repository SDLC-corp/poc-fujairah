import { useEffect, useMemo, useState } from 'react'
import {
  FiArrowRight,
  FiCheck,
  FiCopy,
  FiEdit2,
  FiInfo,
  FiMenu,
  FiPlus,
  FiTrash2,
  FiX,
} from 'react-icons/fi'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  addPoint,
  clearPoints,
  completeShape,
  endDraw,
  resumeDraw,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  movePoint,
  removePoint,
  setMethod,
  setPoints,
  setRadius,
  setShape,
  startDraw,
} from '../../features/draw/drawSlice'
import type { DrawMethod, DrawShape } from '../../features/draw/drawSlice'
import { selectDraftGeometry, selectDraftMetrics } from '../../features/draw/selectors'
import {
  areaLabel,
  INCIDENT_TYPES,
  raiseIncident,
  SEVERITIES,
  SEVERITY_ORDER,
} from '../../features/incidentRegister/registerSlice'
import { REASON_KEY, REASONS } from '../../features/incidents/subjects'
import { selectCurrentUser } from '../../features/users/selectors'
import { setTab } from '../../features/ui/uiSlice'
import { focusPoint } from '../../features/view/viewSlice'
import type { IncidentSeverity, IncidentTypeId } from '../../types/incident'
import { formatArea, formatDistance, formatLatLonParts } from '../../utils/format'
import MapFullscreen from '../MapFullscreen'
import MapLegend from '../MapLegend'
import MapView from '../MapView'
import VesselPicker from '../VesselPicker'

/**
 * Draw the water an incident affects, then say what happened in it.
 *
 * Three steps, in the order the work is actually done: the shape first, because
 * it is the part that needs the chart and the operator's attention; the
 * particulars second, because most of them are filled in by the vessel once she
 * is chosen; the record last, read back before it is filed. An incident number
 * is quoted over the radio and cannot be taken back, so there is a step whose
 * only job is to be read.
 *
 * Both ways of authoring a shape are here and they are the same shape. Clicking
 * the chart writes into the coordinate table, and typing into the table moves
 * the marks — one draft, two ways at it, so an operator who has a position from
 * a bridge can type it and one who is looking at the chart can point at it.
 */

const STEPS = ['Draw', 'Details', 'Review'] as const
type Step = 0 | 1 | 2

const round = (n: number) => Math.round(n * 1e5) / 1e5

export default function DrawIncidentScreen() {
  const dispatch = useAppDispatch()
  const draw = useAppSelector((s) => s.draw)
  const metrics = useAppSelector(selectDraftMetrics)
  const geometry = useAppSelector(selectDraftGeometry)
  const vessels = useAppSelector((s) => s.portData.vessels)
  const user = useAppSelector(selectCurrentUser)

  const [step, setStep] = useState<Step>(0)
  const [type, setType] = useState<IncidentTypeId>('anchor-dragging')
  const [severity, setSeverity] = useState<IncidentSeverity>('high')
  const [vesselIds, setVesselIds] = useState<string[]>([])
  const [area, setArea] = useState('')
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState('')
  const [paste, setPaste] = useState('')
  const [copied, setCopied] = useState(false)
  const fullscreen = useAppSelector((s) => s.ui.mapFullscreen)
  /**
   * Only meaningful full screen, where the panel is over the chart.
   *
   * Drawing needs the panel — the coordinate table is where a corner is checked
   * and Next is how the step is left — so it opens with it showing. What full
   * screen adds is the ability to put it away while corners are being placed,
   * which is the one part of this that wants the whole chart.
   */
  const [panelOpen, setPanelOpen] = useState(true)

  /** Opens a session on arrival and closes it on leaving, either way out. */
  useEffect(() => {
    dispatch(startDraw())
    return () => {
      dispatch(endDraw())
    }
  }, [dispatch])

  const afloat = useMemo(
    () => (vessels?.features ?? []).filter((v) => v.properties.status !== 'sailed'),
    [vessels],
  )
  // In the picker's order rather than the fleet's, so the list reads as chosen.
  // Named apart from `vessels`, which is the store's whole collection.
  const chosenVessels = vesselIds
    .map((id) => afloat.find((v) => v.properties.id === id))
    .filter((v): v is (typeof afloat)[number] => Boolean(v))

  /** Areas the notice declares, which is what an incident is filed against. */
  const anchorageCodes = useMemo(
    () => [...new Set(afloat.map((v) => v.properties.area).filter(Boolean) as string[])].sort(),
    [afloat],
  )

  /**
   * Choosing the first vessel suggests her area, and never overrides a choice.
   *
   * The area used to be taken from the vessel outright, which stops working the
   * moment a vessel is optional — and silently rewriting an area the operator
   * had already set would be worse than not helping at all.
   */
  const firstArea = chosenVessels[0]?.properties.area ?? ''
  useEffect(() => {
    if (firstArea && !area) setArea(firstArea)
  }, [firstArea, area])

  const reasons = REASONS[REASON_KEY[type]] ?? REASONS.traffic
  const chosenReason = reason || reasons[0]

  /** What the record would carry, shown on the review step and filed from it. */
  const geoJson = geometry
    ? JSON.stringify(
        geometry.kind === 'circle'
          ? { type: 'Point', coordinates: geometry.centre, radiusM: geometry.radiusM }
          : { type: 'Polygon', coordinates: [geometry.coordinates] },
        null,
        2,
      )
    : ''

  const drawDone = Boolean(geometry)
  /**
   * A description, and nothing else.
   *
   * The vessels and the area are both optional, because both are things that
   * may not be known when the report is made. What cannot be optional is a line
   * saying what happened: a record with a shape, a time and no account of it is
   * a mark on a chart rather than an incident.
   */
  const detailsDone = Boolean(description.trim())

  function leave() {
    dispatch(setTab('incidents'))
  }

  /**
   * Commit the pasted block.
   *
   * Tolerant on the separator and strict on the order: commas, tabs, spaces or
   * semicolons all part a pair, but which number is which is not guessable from
   * the values — 25 and 56 are both valid latitudes and longitudes here — so the
   * format picker decides it and the box does not try to be clever.
   */
  function commitPaste(lonFirst: boolean) {
    const parsed = paste
      .split(/[\r\n]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/[\s,;]+/).map(Number))
      .filter(
        (pair) => pair.length >= 2 && pair.every((n) => Number.isFinite(n)),
      )
      .map(([a, b]) => (lonFirst ? ([a, b] as [number, number]) : ([b, a] as [number, number])))
      .filter(([lon, lat]) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180)

    if (!parsed.length) return
    // A pasted ring usually repeats its first corner; the draft closes itself,
    // so keeping the repeat would give a duplicate corner in the table.
    const last = parsed.at(-1)!
    const closed =
      parsed.length > 2 && last[0] === parsed[0][0] && last[1] === parsed[0][1]
    dispatch(setPoints(closed ? parsed.slice(0, -1) : parsed))
    dispatch(focusPoint(parsed[0]))
  }

  function file() {
    if (!geometry || !description.trim()) return
    dispatch(
      raiseIncident({
        type,
        typeLabel: INCIDENT_TYPES[type],
        severity,
        occurredAt: new Date().toISOString(),
        description: description.trim(),
        reason: chosenReason,
        area,
        vessels: chosenVessels.map((v) => {
          const p = v.properties
          return {
            id: p.id,
            name: p.name,
            imo: p.imo,
            // Derived from the IMO, as the register's generated rows are: the
            // AIS snapshot carries no MMSI, and inventing a different one per
            // screen would make the same ship look like two.
            mmsi: `4700${String(p.imo).slice(-5)}`,
            type: p.type,
            lengthM: p.lengthM,
            flag: p.flag,
          }
        }),
        measurements: {},
        geometry,
        by: user?.name ?? 'Port control',
        note,
      }),
    )
    leave()
  }

  return (
    <div
      className={`draw-layout${fullscreen ? ' is-full' : ''}${
        fullscreen && !panelOpen ? ' panel-shut' : ''
      }`}
    >
      {/* ---------------- header + steps ---------------- */}
      <header className="draw-head">
        <div className="draw-head-title">
          <nav className="inc-crumbs">
            <button type="button" className="link-cell" onClick={leave}>
              Incidents
            </button>
            <span aria-hidden="true">/</span>
            <span className="muted">Report incident</span>
          </nav>
          <h2>Draw incident area</h2>
          <p className="muted">Define the affected water, then what happened in it.</p>
        </div>

        <ol className="draw-steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'is-on' : i < step ? 'is-done' : undefined}>
              <button
                type="button"
                // Forward only through work already done: step two with no
                // shape would be asking about an incident with no place.
                disabled={i > step && !(i === 1 && drawDone) && !(i === 2 && drawDone && detailsDone)}
                onClick={() => setStep(i as Step)}
              >
                <span className="draw-step-n">{i < step ? <FiCheck size={12} /> : i + 1}</span>
                {label}
              </button>
              {i < STEPS.length - 1 && <FiArrowRight size={13} aria-hidden="true" />}
            </li>
          ))}
        </ol>

        {/* Full screen the panel can be put away; at rest it is a column of
            the layout and there is nothing to put it away from. */}
        {fullscreen && (
          <button
            type="button"
            className="draw-panel-btn"
            aria-label={panelOpen ? 'Hide the drawing panel' : 'Show the drawing panel'}
            aria-expanded={panelOpen}
            title={panelOpen ? 'Hide the panel' : 'Show the panel'}
            onClick={() => setPanelOpen((v) => !v)}
          >
            <FiMenu size={16} />
          </button>
        )}

        <button type="button" className="icon-button draw-close" aria-label="Cancel" onClick={leave}>
          <FiX size={20} />
        </button>
      </header>

      {/* ---------------- the chart ---------------- */}
      <div className="draw-map-wrap">
        {step === 0 && (
          <div className="draw-hint">
            <FiInfo size={14} aria-hidden="true" />
            <span>
              {draw.method === 'manual'
                ? 'Typing below moves the marks on the chart.'
                : draw.shape === 'circle'
                  ? draw.points.length === 0
                    ? 'Click the chart to place the centre.'
                    : !draw.radiusFixed
                      ? 'Click again to set the radius — it follows the cursor until you do.'
                      : 'Centre and radius set.'
                  : draw.complete
                    ? 'Shape finished. Add more corners to change it, or clear and start again.'
                    : draw.points.length < 3
                      ? `Click the chart to add corners — ${3 - draw.points.length} more before it encloses anything.`
                      : 'Click the first corner, or double-click, to finish — or keep adding corners.'}
            </span>

            {/* Three ways to finish, because the two gestures are only obvious
                once you know them: click corner one, double-click, or press
                this. The button is also the only one of the three that works
                on a touch screen. */}
            {draw.shape === 'polygon' &&
              draw.method === 'map' &&
              (draw.complete ? (
                <button
                  type="button"
                  className="draw-finish"
                  onClick={() => dispatch(resumeDraw())}
                >
                  <FiEdit2 size={12} /> Add more corners
                </button>
              ) : (
                <button
                  type="button"
                  className="draw-finish"
                  disabled={draw.points.length < 3}
                  onClick={() => dispatch(completeShape())}
                >
                  <FiCheck size={12} /> Finish shape
                </button>
              ))}

            <button
              type="button"
              className="draw-clear"
              disabled={!draw.points.length}
              onClick={() => dispatch(clearPoints())}
            >
              <FiTrash2 size={12} /> Clear all
            </button>
          </div>
        )}

        <div className="draw-map">
          <MapView />
          <MapFullscreen />
          <MapLegend />

          {/* Where the cursor is, which is the figure being placed. */}
          <div className="draw-readout">
            {draw.hover
              ? formatLatLonParts(draw.hover[1], draw.hover[0]).join('  ')
              : 'Move over the chart'}
          </div>
        </div>
      </div>

      {/* ---------------- the panel ---------------- */}
      <aside className="draw-panel">
        {step === 0 && (
          <>
            <section className="draw-block">
              <h3>1. Drawing method</h3>
              <div className="draw-pick">
                {(
                  [
                    ['map', 'Draw on map', 'Click the chart'],
                    ['manual', 'Manual input', 'Type coordinates'],
                  ] as [DrawMethod, string, string][]
                ).map(([id, label, hint]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={draw.method === id}
                    className={`draw-pick-btn${draw.method === id ? ' is-on' : ''}`}
                    onClick={() => dispatch(setMethod(id))}
                  >
                    <strong>{label}</strong>
                    <span className="muted">{hint}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="draw-block">
              <h3>2. Shape</h3>
              <div className="draw-pick">
                {(
                  [
                    ['polygon', 'Polygon', 'Corners round an extent'],
                    ['circle', 'Circle', 'A centre and a radius'],
                  ] as [DrawShape, string, string][]
                ).map(([id, label, hint]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={draw.shape === id}
                    className={`draw-pick-btn${draw.shape === id ? ' is-on' : ''}`}
                    onClick={() => dispatch(setShape(id))}
                  >
                    <strong>{label}</strong>
                    <span className="muted">{hint}</span>
                  </button>
                ))}
              </div>
              <p className="muted hint">
                Changing shape clears what was drawn with the other one — three corners are not a
                circle, and guessing which circle they meant would be inventing geometry.
              </p>
            </section>

            <section className="draw-block">
              <h3>
                3. {draw.shape === 'circle' ? 'Centre and radius' : 'Corners'}
                <span className="badge badge-low">
                  {draw.shape === 'circle'
                    ? draw.points.length
                      ? 'centre set'
                      : 'no centre'
                    : `${draw.points.length} points`}
                </span>
              </h3>

              {draw.shape === 'circle' ? (
                <>
                  {draw.points.length > 0 && (
                    <dl className="kv kv-wide">
                      <div>
                        <dt>Centre latitude</dt>
                        <dd className="col-num">
                          {formatLatLonParts(draw.points[0][1], draw.points[0][0])[0]}
                        </dd>
                      </div>
                      <div>
                        <dt>Centre longitude</dt>
                        <dd className="col-num">
                          {formatLatLonParts(draw.points[0][1], draw.points[0][0])[1]}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <label className="field">
                    <span>Radius (m)</span>
                    <input
                      className="text-input"
                      type="number"
                      min={MIN_RADIUS_M}
                      max={MAX_RADIUS_M}
                      step={25}
                      value={draw.radiusM}
                      onChange={(e) => dispatch(setRadius(Number(e.target.value)))}
                    />
                    <small className="muted field-note">
                      {MIN_RADIUS_M}–{MAX_RADIUS_M} m. Typing here settles it whether or not the
                      second click has been made.
                    </small>
                  </label>
                </>
              ) : (
                <>
                  <div className="table-scroll draw-coords">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="col-num">#</th>
                          <th>Latitude</th>
                          <th>Longitude</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {draw.points.map(([lon, lat], i) => (
                          <tr key={i}>
                            <td className="col-num muted">{i + 1}</td>
                            <td>
                              <input
                                className="text-input"
                                inputMode="decimal"
                                aria-label={`Corner ${i + 1} latitude`}
                                value={lat}
                                onChange={(e) => {
                                  const n = Number(e.target.value)
                                  if (Number.isFinite(n) && Math.abs(n) <= 90) {
                                    dispatch(movePoint({ index: i, at: [lon, round(n)] }))
                                  }
                                }}
                              />
                            </td>
                            <td>
                              <input
                                className="text-input"
                                inputMode="decimal"
                                aria-label={`Corner ${i + 1} longitude`}
                                value={lon}
                                onChange={(e) => {
                                  const n = Number(e.target.value)
                                  if (Number.isFinite(n) && Math.abs(n) <= 180) {
                                    dispatch(movePoint({ index: i, at: [round(n), lat] }))
                                  }
                                }}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Remove corner ${i + 1}`}
                                onClick={() => dispatch(removePoint(i))}
                              >
                                <FiTrash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {draw.points.length === 0 && (
                          <tr>
                            <td colSpan={4} className="muted">
                              No corners yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="draw-coord-actions">
                    {/* Adds a corner near the last one, so it lands in the same
                        water and only needs nudging. */}
                    <button
                      type="button"
                      className="inc-corner-add"
                      onClick={() => {
                        const last = draw.points.at(-1)
                        const at: [number, number] = last
                          ? [round(last[0] + 0.006), round(last[1] + 0.004)]
                          : [56.52, 25.24]
                        dispatch(addPoint({ at }))
                        if (!last) dispatch(focusPoint(at))
                      }}
                    >
                      <FiPlus size={13} /> Add point
                    </button>
                    <button
                      type="button"
                      className="inc-corner-add"
                      disabled={!draw.points.length}
                      onClick={() => dispatch(removePoint(draw.points.length - 1))}
                    >
                      <FiEdit2 size={13} /> Remove last
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="draw-block">
              <h3>
                4. Geometry
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Copy the GeoJSON"
                  disabled={!geoJson}
                  onClick={() => {
                    navigator.clipboard?.writeText(geoJson).then(
                      () => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1800)
                      },
                      () => {},
                    )
                  }}
                >
                  {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
                </button>
              </h3>
              <pre className="draw-geojson">{geoJson || '— nothing drawn yet —'}</pre>
              <dl className="kv">
                <div>
                  <dt>Area</dt>
                  <dd>{metrics ? formatArea(metrics.areaM2) : '—'}</dd>
                </div>
                <div>
                  <dt>Perimeter</dt>
                  <dd>{metrics ? formatDistance(metrics.perimeterM) : '—'}</dd>
                </div>
                <div>
                  <dt>Points</dt>
                  <dd>{metrics ? metrics.points : 0}</dd>
                </div>
              </dl>
            </section>

            {draw.shape === 'polygon' && (
              <section className="draw-block">
                <h3>Or paste coordinates</h3>
                <label className="field">
                  <span>One pair per line</span>
                  <textarea
                    className="text-input draw-paste"
                    rows={5}
                    placeholder={'56.4200, 25.1200\n56.4700, 25.1200\n56.4700, 25.1600'}
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                  />
                </label>
                <div className="draw-coord-actions">
                  <button
                    type="button"
                    className="inc-corner-add"
                    disabled={!paste.trim()}
                    onClick={() => commitPaste(true)}
                  >
                    Use as longitude, latitude
                  </button>
                  <button
                    type="button"
                    className="inc-corner-add"
                    disabled={!paste.trim()}
                    onClick={() => commitPaste(false)}
                  >
                    Use as latitude, longitude
                  </button>
                </div>
                <p className="muted hint">
                  Commas, tabs, spaces or semicolons all part a pair. Which number is which is not
                  guessable — 25 and 56 are both a valid latitude and longitude here — so it is
                  asked rather than assumed. A repeated first corner is dropped; the ring closes
                  itself.
                </p>
              </section>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <section className="draw-block">
              <h3>Classification</h3>
              <label className="field">
                <span>
                  Type <em className="req">*</em>
                </span>
                <select
                  className="text-input"
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as IncidentTypeId)
                    setReason('')
                  }}
                >
                  {(Object.keys(INCIDENT_TYPES) as IncidentTypeId[]).map((t) => (
                    <option key={t} value={t}>
                      {INCIDENT_TYPES[t]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="field">
                <span>
                  Severity <em className="req">*</em>
                </span>
                <div className="inc-sev-chips">
                  {SEVERITY_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={severity === s}
                      className={`filter-chip chip-labelled inc-sev inc-sev-${SEVERITIES[s].tone}${
                        severity === s ? ' active' : ''
                      }`}
                      onClick={() => setSeverity(s)}
                    >
                      {SEVERITIES[s].label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="draw-block">
              <h3>Vessels</h3>
              <div className="field">
                <span>Vessels involved</span>
                <VesselPicker fleet={afloat} selected={vesselIds} onChange={setVesselIds} />
                <small className="muted field-note">
                  {chosenVessels.length === 0
                    ? 'Optional. A slick is reported before anybody knows which ship it came off — the record does not wait for one.'
                    : chosenVessels.length === 1
                      ? `IMO ${chosenVessels[0].properties.imo} · ${chosenVessels[0].properties.lengthM} m LOA · ${
                          chosenVessels[0].properties.area
                            ? `Area ${chosenVessels[0].properties.area}`
                            : 'outside the declared areas'
                        }`
                      : `${chosenVessels.length} named: ${chosenVessels.map((v) => v.properties.name).join(', ')}`}
                </small>
              </div>

              {/* Its own field now that a vessel is optional — it used to be
                  taken from whichever ship was chosen. Optional too: a slick
                  sighted between two anchorages belongs to neither, and a
                  report that cannot be filed until somebody picks one gets a
                  wrong one picked. The shape already says where it is. */}
              <label className="field">
                <span>Anchorage area</span>
                <select
                  className="text-input"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                >
                  <option value="">No area stated</option>
                  {anchorageCodes.map((code) => (
                    <option key={code} value={code}>
                      Area {code}
                    </option>
                  ))}
                </select>
                <small className="muted field-note">
                  Optional. Suggested from the first vessel named, and never overridden once you
                  have set it.
                </small>
              </label>
            </section>

            <section className="draw-block">
              <h3>What happened</h3>
              <label className="field">
                <span>
                  Description <em className="req">*</em>
                </span>
                <input
                  className="text-input"
                  placeholder="Dragged 300 m in 35 kt winds, tugs dispatched"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Recorded cause</span>
                <select
                  className="text-input"
                  value={chosenReason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {reasons.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Opening note</span>
                <textarea
                  className="text-input"
                  rows={3}
                  maxLength={300}
                  placeholder="What was seen, what was ordered"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </section>
          </>
        )}

        {step === 2 && (
          <>
            <section className="draw-block">
              <h3>
                Review
                <span className={`badge badge-${SEVERITIES[severity].tone}`}>
                  {SEVERITIES[severity].label}
                </span>
              </h3>
              <dl className="kv kv-wide">
                <div>
                  <dt>Type</dt>
                  <dd>{INCIDENT_TYPES[type]}</dd>
                </div>
                <div className="kv-span">
                  <dt>Vessels</dt>
                  <dd>
                    {chosenVessels.length === 0
                      ? 'None named'
                      : chosenVessels.map((v) => v.properties.name).join(', ')}
                  </dd>
                </div>
                <div>
                  <dt>Area</dt>
                  <dd>{areaLabel(area)}</dd>
                </div>
                <div>
                  <dt>Cause</dt>
                  <dd>{chosenReason}</dd>
                </div>
                <div className="kv-span">
                  <dt>Description</dt>
                  <dd>{description || '—'}</dd>
                </div>
                <div>
                  <dt>Shape</dt>
                  <dd>{geometry?.kind === 'circle' ? 'Circle' : 'Polygon'}</dd>
                </div>
                <div>
                  <dt>Area enclosed</dt>
                  <dd>{metrics ? formatArea(metrics.areaM2) : '—'}</dd>
                </div>
              </dl>
              <p className="muted hint">
                It will be filed as <strong>open</strong>, reported by{' '}
                {user?.name ?? 'Port control'}, with this as the first entry on its timeline. The
                incident number is issued on filing and cannot be reused.
              </p>
            </section>

            <section className="draw-block">
              <h3>Geometry as filed</h3>
              <pre className="draw-geojson">{geoJson}</pre>
            </section>
          </>
        )}
      </aside>

      {/* ---------------- footer ---------------- */}
      <footer className="draw-foot">
        <span className="muted">
          {step === 0
            ? drawDone
              ? `${metrics ? formatArea(metrics.areaM2) : ''} enclosed`
              : draw.shape === 'circle'
                ? 'A centre is needed.'
                : 'At least three corners are needed.'
            : step === 1
              ? detailsDone
                ? 'Ready to review.'
                : 'A description is needed — the vessels and the area are optional.'
              : 'Read it back, then file it.'}
        </span>
        <div className="draw-foot-actions">
          <button type="button" className="ghost-button" onClick={leave}>
            Cancel
          </button>
          {step > 0 && (
            <button
              type="button"
              className="ghost-button"
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              Back
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              className="primary-button"
              disabled={step === 0 ? !drawDone : !detailsDone}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Next: {STEPS[step + 1]} <FiArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={!drawDone || !detailsDone}
              onClick={file}
            >
              <FiCheck size={15} /> File incident
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
