import { useEffect, useState } from 'react'
import { FiFilter, FiMenu, FiPlus, FiSearch, FiX } from 'react-icons/fi'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  applyFilters,
  areaLabel,
  INCIDENT_TYPES,
  loadIncidents,
  resetFilters,
  selectIncident,
  setFilterDraft,
  setPage,
  setPageSize,
  setQuery,
  SEVERITIES,
  SEVERITY_ORDER,
  STATUS_ORDER,
  STATUSES,
} from '../../features/incidentRegister/registerSlice'
import {
  incidentCentre,
  selectIncidentAreas,
  selectIncidentPage,
  selectIncidentTotals,
  selectSeverityBreakdown,
} from '../../features/incidentRegister/selectors'
import { highlightFeature } from '../../features/selection/selectionSlice'
import { setTab } from '../../features/ui/uiSlice'
import { focusPoint } from '../../features/view/viewSlice'
import type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentTypeId,
} from '../../types/incident'
import { formatDateTime } from '../../utils/format'
import FeatureDetails from '../FeatureDetails'
import Icon from '../Icon'
import IncidentDonut from '../IncidentDonut'
import MapFocusControl from '../MapFocusControl'
import MapFullscreen from '../MapFullscreen'
import MapLegend from '../MapLegend'
import MapView from '../MapView'
import RawJson from '../RawJson'

const PAGE_SIZES = [10, 25, 50]

/**
 * Who a row names, in the width a row has.
 *
 * "None" rather than a blank cell for an incident with no vessel: a blank reads
 * as missing data, and none named is a fact about the report. A count past two,
 * because three names do not fit a column and the record has them all.
 */
function vesselLabel(i: Incident): string {
  if (i.vessels.length === 0) return 'None named'
  if (i.vessels.length <= 2) return i.vessels.map((v) => v.name).join(', ')
  return `${i.vessels.length} vessels`
}

/**
 * The incident register, in two arrangements.
 *
 * At rest it is a screen with a chart on it: the figures, the map, the filters
 * and the table all visible at once, which is what an operator working through
 * a register wants. Full screen it becomes a chart with a drawer over it —
 * because at that point the map is the whole point, and a panel that keeps a
 * third of it for a list read in bursts is taking the wrong thing away.
 *
 * Same data, same filters, same rows. Only the arrangement changes, and it
 * changes on the one control that already means "the chart matters more than
 * everything beside it".
 */
export default function IncidentsScreen() {
  const dispatch = useAppDispatch()
  const { status, error, draft, applied, pageSize } = useAppSelector((s) => s.incidentRegister)
  const totals = useAppSelector(selectIncidentTotals)
  const breakdown = useAppSelector(selectSeverityBreakdown)
  const areas = useAppSelector(selectIncidentAreas)
  const page = useAppSelector(selectIncidentPage)
  const selected = useAppSelector((s) => s.selection.selected)
  const fullscreen = useAppSelector((s) => s.ui.mapFullscreen)

  /** Only meaningful full screen, where the list has nowhere else to be. */
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    if (status === 'idle') dispatch(loadIncidents())
  }, [status, dispatch])

  /**
   * Fly to an incident and light it, without leaving the chart.
   *
   * `highlightFeature` rather than `selectFeature`: the first drives the
   * feature-state the incident layers style on, the second would also drop a
   * details card over the chart the operator just asked to look at.
   */
  function locate(incident: Incident) {
    const at = incidentCentre(incident)
    if (at) dispatch(focusPoint(at))
    dispatch(highlightFeature({ layer: 'incidents', id: incident.id }))
  }

  /** The record itself, which is a different question from where it is. */
  function open(id: string) {
    dispatch(selectIncident(id))
    dispatch(setTab('incident'))
  }

  function jump(next: Parameters<typeof setFilterDraft>[0]) {
    dispatch(resetFilters())
    dispatch(setFilterDraft(next))
    dispatch(applyFilters())
    setDrawerOpen(true)
  }

  const cards = [
    { key: 'open', icon: 'alert', tone: 'alert', label: 'Open incidents', short: 'Open', value: totals.byStatus.open, onView: () => jump({ status: 'open' }) },
    { key: 'high', icon: 'alert', tone: 'warn', label: 'High severity, open', short: 'High, open', value: totals.openHigh, onView: () => jump({ status: 'open', severity: 'high' }) },
    { key: 'week', icon: 'schedule', tone: 'info', label: 'Raised this week', short: 'This week', value: totals.thisWeek, onView: () => jump({}) },
    { key: 'done', icon: 'available', tone: 'ok', label: 'Dealt with, 30 days', short: 'Dealt with', value: totals.resolvedThisMonth, onView: () => jump({ status: 'resolved' }) },
  ]

  const facetCount =
    (applied.severity !== 'all' ? 1 : 0) +
    (applied.status !== 'all' ? 1 : 0) +
    (applied.type !== 'all' ? 1 : 0) +
    (applied.area !== 'all' ? 1 : 0) +
    (applied.from || applied.to ? 1 : 0)

  /* --- the pieces both arrangements use ---------------------------------- */

  const searchBox = (
    <label className="inc-search">
      <FiSearch size={13} aria-hidden="true" />
      <input
        type="search"
        className="text-input"
        placeholder="Search incident, vessel or area…"
        aria-label="Search incidents"
        value={draft.query}
        onChange={(e) => dispatch(setQuery(e.target.value))}
      />
    </label>
  )

  /**
   * The facets, identical in both arrangements.
   *
   * One definition rather than two, because a filter offered on one layout and
   * missing from the other would make the same screen behave differently
   * depending on how big the map happened to be.
   */
  const filterFields = (
    <>
      <div className="field">
        <span>Date range</span>
        <div className="inc-filter-dates">
          <input
            type="date"
            className="text-input"
            aria-label="Incidents from date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => dispatch(setFilterDraft({ from: e.target.value }))}
          />
          <span aria-hidden="true">–</span>
          <input
            type="date"
            className="text-input"
            aria-label="Incidents to date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => dispatch(setFilterDraft({ to: e.target.value }))}
          />
        </div>
      </div>

      <div className="inc-filter-grid">
        <label className="field">
          <span>Severity</span>
          <select
            className="text-input"
            value={draft.severity}
            onChange={(e) =>
              dispatch(setFilterDraft({ severity: e.target.value as IncidentSeverity | 'all' }))
            }
          >
            <option value="all">All</option>
            {SEVERITY_ORDER.map((s) => (
              <option key={s} value={s}>{SEVERITIES[s].label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select
            className="text-input"
            value={draft.status}
            onChange={(e) =>
              dispatch(setFilterDraft({ status: e.target.value as IncidentStatus | 'all' }))
            }
          >
            <option value="all">All</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUSES[s].label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Type</span>
          <select
            className="text-input"
            value={draft.type}
            onChange={(e) =>
              dispatch(setFilterDraft({ type: e.target.value as IncidentTypeId | 'all' }))
            }
          >
            <option value="all">All</option>
            {(Object.keys(INCIDENT_TYPES) as IncidentTypeId[]).map((t) => (
              <option key={t} value={t}>{INCIDENT_TYPES[t]}</option>
            ))}
          </select>
        </label>
        {/* Built from what the register mentions rather than the notice's full
            list: an area that can never match only teaches distrust. */}
        <label className="field">
          <span>Area</span>
          <select
            className="text-input"
            value={draft.area}
            onChange={(e) => dispatch(setFilterDraft({ area: e.target.value }))}
          >
            <option value="all">All</option>
            {areas.map((a) => (
              <option key={a} value={a}>Area {a}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="inc-filter-actions">
        <button type="button" className="ghost-button" onClick={() => dispatch(resetFilters())}>
          Reset
        </button>
        <button type="button" className="primary-button" onClick={() => dispatch(applyFilters())}>
          <FiFilter size={13} /> Apply
        </button>
      </div>
    </>
  )

  const pager = (
    <>
      <span className="muted">
        {page.total === 0 ? 'No rows' : `${page.firstRow}–${page.lastRow} of ${page.total}`}
      </span>
      <div className="inc-pager-nav">
        <button
          type="button"
          disabled={page.page <= 1}
          onClick={() => dispatch(setPage(page.page - 1))}
          aria-label="Previous page"
        >
          ‹
        </button>
        <span className="inc-pager-at">
          {page.page} / {page.pages}
        </span>
        <button
          type="button"
          disabled={page.page >= page.pages}
          onClick={() => dispatch(setPage(page.page + 1))}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </>
  )

  if (status === 'loading') return <p className="muted">Loading the incident register…</p>
  if (status === 'failed') return <p className="field-error">{error}</p>

  /* --- full screen: a chart with a drawer over it ------------------------- */

  if (fullscreen) {
    return (
      <div className={`inc-map-layout${drawerOpen ? ' drawer-open' : ''}`}>
        <MapView />
        <MapFullscreen />
        <MapFocusControl />
        <MapLegend />
        <FeatureDetails />

        <div className="inc-hud">
          <div className="inc-hud-head">
            <strong>Incidents</strong>
            <button
              type="button"
              className="inc-raise"
              onClick={() => dispatch(setTab('incident-draw'))}
            >
              <FiPlus size={13} aria-hidden="true" /> Report
            </button>
          </div>
          <div className="inc-hud-cards">
            {cards.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`inc-hud-card inc-card-${c.tone}`}
                title={`Filter the list to ${c.label.toLowerCase()}`}
                onClick={c.onView}
              >
                <Icon name={c.icon} size={14} />
                <span className="inc-hud-value">{c.value}</span>
                <span className="inc-hud-label">{c.short}</span>
              </button>
            ))}
          </div>
        </div>

        {!drawerOpen && (
          <button
            type="button"
            className="inc-drawer-btn"
            aria-label={`Show the incident list, ${page.total} matching`}
            title="Show the incident list"
            onClick={() => setDrawerOpen(true)}
          >
            <FiMenu size={17} />
            <span className="inc-drawer-count">{page.total}</span>
          </button>
        )}

        {drawerOpen && (
          <aside className="inc-drawer" aria-label="Incident list">
            <header className="inc-drawer-head">
              <div>
                <strong>Incident list</strong>
                <span className="muted">
                  {page.total} of {totals.total}
                  {facetCount > 0 && ` · ${facetCount} filter${facetCount === 1 ? '' : 's'}`}
                </span>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Hide the incident list"
                onClick={() => setDrawerOpen(false)}
              >
                <FiX size={18} />
              </button>
            </header>

            <div className="inc-drawer-tools">
              {searchBox}
              <button
                type="button"
                className={`inc-filter-btn${showFilters ? ' is-on' : ''}`}
                aria-expanded={showFilters}
                onClick={() => setShowFilters((v) => !v)}
              >
                <FiFilter size={13} /> Filters
                {facetCount > 0 && <span className="inc-facet-dot">{facetCount}</span>}
              </button>
            </div>

            {showFilters && <div className="inc-drawer-filters">{filterFields}</div>}

            <ol className="inc-rows">
              {page.rows.map((i) => {
                const on = selected?.layer === 'incidents' && selected.id === i.id
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      className={`inc-row-btn inc-sev-edge-${SEVERITIES[i.severity].tone}${on ? ' is-on' : ''}`}
                      aria-current={on ? 'true' : undefined}
                      title="Show this on the chart"
                      onClick={() => locate(i)}
                    >
                      <span className="inc-row-top">
                        <span className="inc-row-id">{i.id}</span>
                        <span className={`badge badge-${STATUSES[i.status].tone}`}>
                          {STATUSES[i.status].label}
                        </span>
                      </span>
                      <span className="inc-row-what">
                        {i.typeLabel}
                        {i.vessels.length > 0 && ` · ${vesselLabel(i)}`}
                      </span>
                      <span className="inc-row-meta muted">
                        {areaLabel(i.area)} · {formatDateTime(i.occurredAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="inc-row-open"
                      title={`Open ${i.id}`}
                      onClick={() => open(i.id)}
                    >
                      Open
                    </button>
                  </li>
                )
              })}
              {page.rows.length === 0 && (
                <li className="inc-rows-empty muted">
                  No incident matches these filters{facetCount > 0 && ' — try widening them'}.
                </li>
              )}
            </ol>

            <footer className="inc-drawer-foot">{pager}</footer>

            <div className="inc-drawer-donut">
              <IncidentDonut slices={breakdown} total={totals.total} />
            </div>
          </aside>
        )}
      </div>
    )
  }

  /* --- at rest: the register as a screen ---------------------------------- */

  return (
    <div className="inc-layout">
      <div className="inc-bar">
        <p className="muted">Monitor and manage all anchorage incidents.</p>
        <button
          type="button"
          className="inc-raise"
          onClick={() => dispatch(setTab('incident-draw'))}
        >
          <FiPlus size={14} aria-hidden="true" /> Report incident
        </button>
      </div>

      <section className="panel inc-cards-panel">
        {cards.map((c) => (
          <div key={c.key} className={`inc-card inc-card-${c.tone}`}>
            <span className="inc-card-mark">
              <Icon name={c.icon} size={18} />
            </span>
            <div className="inc-card-body">
              <span className="inc-card-value">{c.value}</span>
              <span className="inc-card-label">{c.label}</span>
            </div>
            <button type="button" className="link-cell" onClick={c.onView}>
              View all
            </button>
          </div>
        ))}
      </section>

      {/* Drawn from the filtered set, so the chart and the table cannot be
          showing different registers. Expanding it hands the screen over to the
          arrangement above. */}
      <div className="inc-map">
        <MapView />
        <MapFullscreen />
        <MapFocusControl />
        <MapLegend />
        <FeatureDetails />
      </div>

      {/* One column, stacked: the summary then the filters. Held in a single
          container that spans both grid rows, so each panel sits directly under
          the one before it. As separate grid items they were pinned to rows
          sized by the map and the table beside them, which opened a gap
          wherever a panel was shorter than its row. */}
      <div className="inc-side">
        <section className="panel inc-summary-panel">
          <h2>Incident summary</h2>
          <IncidentDonut slices={breakdown} total={totals.total} />
        </section>

        <section className="panel inc-filters-panel">
          <h2>Filters</h2>
          <div className="inc-filters">{filterFields}</div>
        </section>
      </div>

      <section className="panel inc-list-panel">
        <h2>
          Incident list
          <span className="badge badge-low">{page.total}</span>
        </h2>

        <div className="inc-toolbar">{searchBox}</div>

        <div className="table-scroll report-rows">
          <table className="data-table inc-table">
            <thead>
              <tr>
                <th>Incident</th>
                <th>Type</th>
                <th>Vessel</th>
                <th>Area</th>
                <th>Severity</th>
                <th>Occurred</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {page.rows.map((i) => {
                const on = selected?.layer === 'incidents' && selected.id === i.id
                return (
                  <tr key={i.id} className={on ? 'row-selected' : undefined}>
                    <td>
                      <button
                        type="button"
                        className={`inc-id inc-id-${i.severity}`}
                        onClick={() => open(i.id)}
                        title="Open this incident"
                      >
                        {i.id}
                      </button>
                    </td>
                    <td>{i.typeLabel}</td>
                    <td className={i.vessels.length ? undefined : 'muted'}>{vesselLabel(i)}</td>
                    <td className={i.area ? undefined : 'muted'}>{areaLabel(i.area)}</td>
                    <td>
                      <span className={`badge badge-${SEVERITIES[i.severity].tone}`}>
                        {SEVERITIES[i.severity].label}
                      </span>
                    </td>
                    <td className="muted col-num">{formatDateTime(i.occurredAt)}</td>
                    <td>
                      <span
                        className={`badge badge-${STATUSES[i.status].tone}`}
                        title={STATUSES[i.status].hint}
                      >
                        {STATUSES[i.status].label}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="inc-locate"
                        title="Show this on the chart"
                        onClick={() => locate(i)}
                      >
                        Locate
                      </button>
                    </td>
                  </tr>
                )
              })}
              {page.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    No incident matches these filters{facetCount > 0 && ' — try widening them'}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="inc-pager">
          {pager}
          <label className="inc-pager-size">
            <select
              value={pageSize}
              aria-label="Rows per page"
              onChange={(e) => dispatch(setPageSize(Number(e.target.value)))}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <RawJson
        label="GET /api/incidents"
        data={{
          filters: applied,
          page: { page: page.page, pages: page.pages, size: pageSize, matched: page.total },
          totals,
          rows: page.rows.map((i) => ({
            id: i.id,
            type: i.type,
            severity: i.severity,
            status: i.status,
            vessels: i.vessels.map((v) => v.name),
            area: i.area,
            occurredAt: i.occurredAt,
          })),
        }}
      />
    </div>
  )
}
