import { useEffect, useState } from 'react'
import { FiArrowLeft, FiArrowRight, FiChevronLeft, FiRadio } from 'react-icons/fi'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  addIncidentNote,
  areaLabel,
  loadIncidents,
  selectIncident,
  setIncidentStatus,
  SEVERITIES,
  STATUS_ORDER,
  STATUSES,
} from '../../features/incidentRegister/registerSlice'
import {
  incidentCentre,
  selectFilteredIncidents,
  selectSelectedIncident,
} from '../../features/incidentRegister/selectors'
import { selectCurrentUser } from '../../features/users/selectors'
import { recordSubject } from '../../features/incidents/subjects'
import { setTab } from '../../features/ui/uiSlice'
import { focusPoint } from '../../features/view/viewSlice'
import { formatArea, formatDateTime, formatDistance, formatLatLonParts } from '../../utils/format'
import MapFocusControl from '../MapFocusControl'
import MapFullscreen from '../MapFullscreen'
import MapView from '../MapView'
import RawJson from '../RawJson'
import SendIncidentMailDialog from '../SendIncidentMailDialog'
import type { IncidentMail } from '../SendIncidentMailDialog'

/**
 * One incident, in full.
 *
 * Previous and Next walk the *filtered* register rather than the whole of it, so
 * an operator who narrowed the list to one vessel's open incidents steps through
 * those and not through fifty unrelated ones. Walking the unfiltered register
 * from a filtered list is the sort of thing that makes somebody lose their place
 * and start again.
 */
export default function IncidentDetailScreen() {
  const dispatch = useAppDispatch()
  const status = useAppSelector((s) => s.incidentRegister.status)
  const incident = useAppSelector(selectSelectedIncident)
  const siblings = useAppSelector(selectFilteredIncidents)
  const user = useAppSelector(selectCurrentUser)
  const [note, setNote] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState<IncidentMail | null>(null)

  useEffect(() => {
    if (status === 'idle') dispatch(loadIncidents())
  }, [status, dispatch])

  /**
   * Frame the chart on this record, and re-frame it when Previous/Next moves.
   *
   * A point rather than a bbox fit: an incident area here is a few hundred
   * metres across, and `focusPoint`'s zoom floor already puts that comfortably
   * in the pane — while a fit would zoom right in on a 150 m proximity circle
   * and lose every landmark around it. The camera never zooms *out* on an
   * operator who has already gone further in than that.
   */
  // Keyed by the two numbers rather than by the array, so a re-render with the
  // same record does not re-fly the camera — `incidentPlace` builds a fresh
  // array every time and a dependency on it would fire on every render.
  const place = incidentCentre(incident)
  const placeLon = place?.[0]
  const placeLat = place?.[1]
  useEffect(() => {
    if (placeLon != null && placeLat != null) dispatch(focusPoint([placeLon, placeLat]))
  }, [placeLon, placeLat, dispatch])

  if (status === 'loading') return <p className="muted">Loading the incident register…</p>
  if (!incident) return <p className="muted">No incident selected.</p>

  const at = siblings.findIndex((i) => i.id === incident.id)
  const previous = at > 0 ? siblings[at - 1] : null
  const next = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null

  const by = user?.name ?? 'Port control'
  const g = incident.geometry

  /**
   * Whatever this kind of incident was measured with, as rows.
   *
   * Driven off what is present rather than off the type, so a kind that starts
   * carrying a new measurement shows it without this screen being told.
   */
  const measured: [string, string][] = [
    ...(g.kind === 'circle'
      ? ([['Affected radius', formatDistance(g.radiusM)]] as [string, string][])
      : []),
    ...(incident.measurements.dragDistanceM != null
      ? ([
          ['Anchor drag distance', formatDistance(incident.measurements.dragDistanceM)],
        ] as [string, string][])
      : []),
    ...(incident.measurements.affectedAreaKm2 != null
      ? ([['Slick extent', `${incident.measurements.affectedAreaKm2} km²`]] as [string, string][])
      : []),
    ...(incident.measurements.estimatedVolumeM3 != null
      ? ([
          ['Estimated volume', `${incident.measurements.estimatedVolumeM3} m³`],
        ] as [string, string][])
      : []),
    ...(incident.measurements.speedKn != null
      ? ([['Speed', `${incident.measurements.speedKn} kn`]] as [string, string][])
      : []),
    ...(incident.measurements.windKt != null
      ? ([['Wind', `${incident.measurements.windKt} kt`]] as [string, string][])
      : []),
    ...(incident.measurements.dwellMinutes != null
      ? ([['Time inside', `${incident.measurements.dwellMinutes} min`]] as [string, string][])
      : []),
  ]

  return (
    <div className="inc-detail-layout">
      <section className="panel panel-wide">
        <nav className="inc-crumbs">
          <button type="button" className="link-cell" onClick={() => dispatch(setTab('incidents'))}>
            <FiChevronLeft size={13} aria-hidden="true" /> Incidents
          </button>
          <span aria-hidden="true">/</span>
          <span className="muted">{incident.id}</span>
        </nav>

        <div className="inc-head">
          <div className="inc-head-id">
            <h2>
              {incident.id}
              <span className={`badge badge-${SEVERITIES[incident.severity].tone}`}>
                {SEVERITIES[incident.severity].label}
              </span>
              <span
                className={`badge badge-${STATUSES[incident.status].tone}`}
                title={STATUSES[incident.status].hint}
              >
                {STATUSES[incident.status].label}
              </span>
            </h2>
            <p className="muted">{incident.description}</p>
          </div>

          <div className="inc-head-nav">
            {/* The action the register is for: telling shipping. It opens the
                same dialog the dashboard and the drag banner use, built from
                this record rather than from a condition recomputed now — see
                `recordSubject`. */}
            <button
              type="button"
              className="inc-report-btn"
              onClick={() => setReporting(true)}
            >
              <FiRadio size={13} /> {reported ? 'Report again' : 'Report to shipping'}
            </button>
            <button
              type="button"
              disabled={!previous}
              title={previous ? `Previous: ${previous.id}` : 'First in the filtered list'}
              onClick={() => previous && dispatch(selectIncident(previous.id))}
            >
              <FiArrowLeft size={13} /> Previous
            </button>
            <button
              type="button"
              disabled={!next}
              title={next ? `Next: ${next.id}` : 'Last in the filtered list'}
              onClick={() => next && dispatch(selectIncident(next.id))}
            >
              Next <FiArrowRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {/* The record itself: what it is, where it is, and what happened to it. */}
      <div className="inc-detail-main">
        <section className="panel">
          <h2>Incident information</h2>
          <dl className="kv kv-wide">
            <div>
              <dt>Type</dt>
              <dd>{incident.typeLabel}</dd>
            </div>
            <div>
              <dt>Occurred at</dt>
              <dd>{formatDateTime(incident.occurredAt)} UTC</dd>
            </div>
            <div>
              <dt>Anchorage area</dt>
              <dd>{areaLabel(incident.area)}</dd>
            </div>
            <div>
              <dt>Reported by</dt>
              <dd>{incident.reportedBy}</dd>
            </div>
            <div className="kv-span">
              <dt>Recorded cause</dt>
              <dd>{incident.reason}</dd>
            </div>
            {measured.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel">
          <h2>
            Affected area
            <span className="badge badge-low">{g.kind === 'circle' ? 'Circle' : 'Polygon'}</span>
          </h2>

          {g.kind === 'circle' ? (
            <>
              <dl className="kv kv-wide">
                <div>
                  <dt>Radius</dt>
                  <dd>{formatDistance(g.radiusM)}</dd>
                </div>
                <div>
                  <dt>Area</dt>
                  <dd>{formatArea(Math.PI * g.radiusM * g.radiusM)}</dd>
                </div>
                <div>
                  <dt>Centre latitude</dt>
                  <dd className="col-num">{formatLatLonParts(g.centre[1], g.centre[0])[0]}</dd>
                </div>
                <div>
                  <dt>Centre longitude</dt>
                  <dd className="col-num">{formatLatLonParts(g.centre[1], g.centre[0])[1]}</dd>
                </div>
              </dl>
              <p className="muted hint">
                Held as a centre and a radius, which is what was authored. The ring drawn on the
                chart is derived from those two figures rather than stored beside them — a stored
                ring is a second copy that can disagree with the radius it came from.
              </p>
            </>
          ) : (
            <>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="col-num">#</th>
                      <th>Latitude</th>
                      <th>Longitude</th>
                      <th>Decimal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.coordinates.map(([lon, lat], i) => {
                      const [latDmm, lonDmm] = formatLatLonParts(lat, lon)
                      const last = i === g.coordinates.length - 1
                      return (
                        <tr key={`${lon},${lat},${i}`}>
                          <td className="col-num muted">{last ? '↺' : i + 1}</td>
                          <td className="col-num">{latDmm}</td>
                          <td className="col-num">{lonDmm}</td>
                          <td className="muted col-num">
                            {lat.toFixed(5)}, {lon.toFixed(5)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="muted hint">
                {g.coordinates.length} points, the last repeating the first to close the ring — which
                is why it is marked ↺ rather than numbered. A ring that does not close is not a
                polygon, so the repeat is data and not a duplicate row.
              </p>
            </>
          )}
        </section>

        <section className="panel">
          <h2>
            Incident timeline
            <span className="badge badge-low">{incident.timeline.length}</span>
          </h2>
          <ol className="timeline">
            {incident.timeline.map((e) => (
              <li key={`${e.at}-${e.event}`}>
                <span className="timeline-dot" />
                <div>
                  <strong>{e.event}</strong> · {e.by}
                  <span className="muted">
                    {formatDateTime(e.at)} — {e.note}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* The chart and what surrounds it. A map on a record belongs in the
          column that is glanced at rather than the one that is read — and at
          this width it is a card, not a band across the page. */}
      <aside className="inc-detail-side">
        <section className="panel">
          <h2>
            Incident location
            {reported && (
              <span className="badge badge-ok">broadcast to {reported.to}</span>
            )}
          </h2>
          {/* The real chart, with the register's own layer already on it — so the
              affected water is drawn by the same layers the list screen uses and
              the two cannot show the same incident differently. */}
          <div className="inc-detail-map">
            <MapView />
            <MapFullscreen />
            <MapFocusControl />
          </div>
          <p className="muted hint">
            Framed on this incident. Its area is drawn solid while the incident is open and dashed
            once it has been dealt with, coloured by severity — the whole filtered register is on the
            chart, so the neighbours of this one are visible around it.
          </p>
        </section>

        <section className="panel">
          <h2>
            Vessels involved
            <span className="badge badge-low">{incident.vessels.length}</span>
          </h2>

          {/* None named is a real state and gets said, not left as a blank panel:
              a slick is reported before anybody knows which ship it came off. */}
          {incident.vessels.length === 0 ? (
            <p className="muted">
              No vessel named against this incident. It is filed on the water it affects — see the
              affected area below.
            </p>
          ) : (
            incident.vessels.map((v) => (
              <dl key={v.id} className="kv kv-wide inc-vessel">
                <div className="kv-span">
                  <dt>Name</dt>
                  <dd>{v.name}</dd>
                </div>
                <div>
                  <dt>IMO</dt>
                  <dd className="col-num">{v.imo}</dd>
                </div>
                <div>
                  <dt>MMSI</dt>
                  <dd className="col-num">{v.mmsi}</dd>
                </div>
                <div>
                  <dt>LOA</dt>
                  <dd>{v.lengthM} m</dd>
                </div>
                <div>
                  <dt>Flag</dt>
                  <dd>{v.flag}</dd>
                </div>
              </dl>
            ))
          )}
        </section>

        <section className="panel">
          <h2>
            Notes
            <span className="badge badge-low">{incident.notes.length}</span>
          </h2>

          {incident.notes.length === 0 ? (
            <p className="muted">Nothing recorded against this incident yet.</p>
          ) : (
            <ul className="inc-notes">
              {incident.notes.map((n) => (
                <li key={`${n.at}-${n.by}`}>
                  <p>{n.text}</p>
                  <span className="muted">
                    {n.by} · {formatDateTime(n.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <label className="field inc-note-add">
            <span>Add a note</span>
            <textarea
              className="text-input"
              rows={2}
              maxLength={300}
              placeholder="What was done, what was said, anything the next watch needs"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={!note.trim()}
            onClick={() => {
              dispatch(addIncidentNote({ id: incident.id, by, text: note }))
              setNote('')
            }}
          >
            Add note
          </button>
        </section>

        <section className="panel">
          <h2>Status</h2>
          <p className="muted hint">
            Moving the status writes an entry on the timeline with it. A status that changed with
            nothing to say who moved it is a record that has lost the only part anyone would audit.
          </p>
          <div className="inc-status-actions">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={`filter-chip chip-labelled${incident.status === s ? ' active' : ''}`}
                disabled={incident.status === s}
                title={STATUSES[s].hint}
                onClick={() => dispatch(setIncidentStatus({ id: incident.id, status: s, by }))}
              >
                {STATUSES[s].label}
              </button>
            ))}
          </div>
        </section>
      </aside>

      <RawJson label={`GET /api/incidents/${incident.id}`} data={incident} />

      {reporting && (
        <SendIncidentMailDialog
          subject={recordSubject(incident)}
          onSend={(report) => {
            setReported(report)
            setReporting(false)
            // The broadcast is a thing that happened to the incident, so it
            // goes on the record's own timeline as well as in the broadcast
            // log — a file that does not say shipping was told is missing the
            // part somebody will be asked about.
            dispatch(
              addIncidentNote({
                id: incident.id,
                by,
                text: `Broadcast to ${report.to} — ${report.reason}${
                  report.note ? `. ${report.note}` : ''
                }`,
              }),
            )
          }}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  )
}
