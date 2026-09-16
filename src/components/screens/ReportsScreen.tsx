import { useMemo, useState } from 'react'
import { useAppSelector } from '../../app/hooks'
import {
  selectAreaCapacity,
  selectAreas,
  selectRestrictedIncursions,
} from '../../features/analysis/selectors'
import { VESSEL_LABELS, VESSEL_TYPES } from '../../map/vesselTypes'
import { flagName } from '../../utils/flags'
import { formatDateTime, formatDuration, hoursBetween } from '../../utils/format'
import { utilisationLoad } from '../../utils/occupancyLoad'
import FlagFilter from '../FlagFilter'
import FlagIcon from '../FlagIcon'
import Icon from '../Icon'
import RawJson from '../RawJson'

/** Historical throughput. No back-end here, so the series is sample data. */
const MONTHLY = [
  { m: 'Mar', calls: 61 },
  { m: 'Apr', calls: 74 },
  { m: 'May', calls: 68 },
  { m: 'Jun', calls: 82 },
  { m: 'Jul', calls: 91 },
  { m: 'Aug', calls: 44 },
]

/** Next month, from the occupancy model — drawn hatched, not as measured fact. */
const FORECAST = { m: 'Sep', calls: 96, ci: [88, 104] as const }

const TEMPLATES = [
  { id: 'hourly', name: 'Hourly occupancy', desc: 'Spot-by-spot utilisation, 24 h', icon: 'gauge' },
  { id: 'daily', name: 'Daily summary', desc: 'Calls, moves, dwell time, incidents', icon: 'reports' },
  { id: 'monthly', name: 'Monthly trends', desc: 'Throughput and utilisation by month', icon: 'occupancy' },
  { id: 'zone', name: 'Zone incursions', desc: 'Restricted-zone entries with duration', icon: 'alert' },
]

const DAY_MS = 86_400_000

/**
 * `days: null` means the range is not a rolling window — All takes everything,
 * Custom takes whatever the two date fields say.
 */
const RANGES: { id: string; label: string; days: number | null }[] = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'last7', label: 'Last 7 days', days: 7 },
  { id: 'last30', label: 'Last 30 days', days: 30 },
  { id: 'last90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All dates', days: null },
  { id: 'custom', label: 'Custom…', days: null },
]

/** Milliseconds, or null for an open end. Dates are read as UTC, as ATA is. */
function resolveWindow(range: string, from: string, to: string) {
  const now = Date.now()

  if (range === 'all') return { from: null, to: null }

  if (range === 'custom') {
    return {
      from: from ? Date.parse(`${from}T00:00:00Z`) : null,
      // Inclusive of the closing day — an operator asking for the 3rd means the
      // whole of the 3rd, not midnight at the start of it.
      to: to ? Date.parse(`${to}T23:59:59.999Z`) : null,
    }
  }

  const days = RANGES.find((r) => r.id === range)?.days ?? 7
  if (days === 0) {
    const midnight = new Date()
    midnight.setUTCHours(0, 0, 0, 0)
    return { from: midnight.getTime(), to: now }
  }
  return { from: now - days * DAY_MS, to: now }
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const FORMATS = ['PDF', 'Excel', 'CSV', 'JSON']

interface GeneratedReport {
  id: string
  name: string
  range: string
  format: string
  at: string
  rows: number
}

/** A couple of prior runs so the history table is not empty on first load. */
const SEED: GeneratedReport[] = [
  {
    id: 'RPT-0912',
    name: 'Daily summary',
    range: 'Last 7 days',
    format: 'PDF',
    at: '2026-08-03T06:00:00Z',
    rows: 214,
  },
  {
    id: 'RPT-0911',
    name: 'Zone incursions',
    range: 'Last 30 days',
    format: 'Excel',
    at: '2026-08-02T18:30:00Z',
    rows: 37,
  },
]

export default function ReportsScreen() {
  const capacity = useAppSelector(selectAreaCapacity)
  const incursions = useAppSelector(selectRestrictedIncursions)
  const vessels = useAppSelector((s) => s.portData.vessels)

  const areas = useAppSelector(selectAreas)

  const [template, setTemplate] = useState('daily')
  /**
   * Ninety days rather than seven, because `vessels.json` is generated with
   * arrival times relative to whenever the generator was last run — a tighter
   * default opens the screen on an empty report whenever the sample data has
   * aged. Re-run `npm run gen:vessels` and any of these work.
   */
  const [range, setRange] = useState('last90')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  /** Empty means "every one of them" — the usual faceted-filter convention. */
  const [areaSel, setAreaSel] = useState<string[]>([])
  const [flagSel, setFlagSel] = useState<string[]>([])
  const [type, setType] = useState('all')
  const [format, setFormat] = useState('PDF')
  const [history, setHistory] = useState<GeneratedReport[]>(SEED)

  const chosen = TEMPLATES.find((t) => t.id === template)
  const rangeLabel = RANGES.find((r) => r.id === range)?.label ?? range

  /* --- period figures, derived from the live data rather than invented ----
   * Memoised because the filter below keys off it: `?? []` hands back a fresh
   * array on every render while the data is still loading, which would defeat
   * every useMemo that depends on it. */
  const fleet = useMemo(() => vessels?.features ?? [], [vessels])

  /* --- the filter set ----------------------------------------------------
   * Both facets are built from what is actually out there rather than from the
   * reference lists: the ISO table carries 47 flag states and the notice
   * defines a dozen areas, and offering one that can never match anything only
   * teaches the operator to distrust an empty result. */
  const anchorages = useMemo(
    () => areas.filter((a) => a.properties.category === 'anchorage'),
    [areas],
  )

  /**
   * Busiest registry first, ties broken by name. The count is the point: a
   * flag with two vessels behind it and one with forty are not the same choice,
   * and alphabetical order hides which is which.
   */
  const flagsPresent = useMemo(() => {
    const counts = new Map<string, number>()
    for (const v of fleet) {
      const code = v.properties.flag
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    return [...counts]
      .map(([code, count]) => ({ code, name: flagName(code), count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [fleet])

  const span = useMemo(
    () => resolveWindow(range, customFrom, customTo),
    [range, customFrom, customTo],
  )

  /** An empty facet means "all of them", so it drops out of the predicate. */
  const filtered = useMemo(
    () =>
      fleet.filter((v) => {
        const p = v.properties
        if (areaSel.length && (!p.area || !areaSel.includes(p.area))) return false
        if (flagSel.length && !flagSel.includes(p.flag)) return false
        if (type !== 'all' && p.type !== type) return false
        if (span.from != null || span.to != null) {
          // Dated on arrival. A vessel with no ATA has not called in any window,
          // so it falls out of every dated report rather than all of them.
          const at = p.ata ? Date.parse(p.ata) : NaN
          if (Number.isNaN(at)) return false
          if (span.from != null && at < span.from) return false
          if (span.to != null && at > span.to) return false
        }
        return true
      }),
    [fleet, areaSel, flagSel, type, span],
  )

  const matchedDwells = filtered
    .map((v) => hoursBetween(v.properties.ata, v.properties.etd))
    .filter((h): h is number => h != null && h > 0)
  const matchedAvgDwell = matchedDwells.length
    ? Math.round(matchedDwells.reduce((a, b) => a + b, 0) / matchedDwells.length)
    : null

  /**
   * The matched rows in the order a report reads them: most recent arrival
   * first.
   *
   * Sorted rather than left in fleet order, which is the order the generator
   * happened to write the file in and means nothing to anyone. The report is
   * matched on arrival date, so arrival is the column it is about — and now that
   * every match is listed rather than the first dozen, the order is what decides
   * whether the top of the table is the useful end of it.
   */
  const rows = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          (b.properties.ata ? Date.parse(b.properties.ata) : 0) -
          (a.properties.ata ? Date.parse(a.properties.ata) : 0),
      ),
    [filtered],
  )

  /** Where the matches are lying, busiest first — the report's own breakdown. */
  const matchedByArea = useMemo(() => {
    const counts = new Map<string, number>()
    for (const v of filtered) {
      const code = v.properties.area
      if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [filtered])

  const facetCount = areaSel.length + flagSel.length + (type === 'all' ? 0 : 1)

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  function clearFilters() {
    setAreaSel([])
    setFlagSel([])
    setType('all')
    setRange('last90')
    setCustomFrom('')
    setCustomTo('')
  }
  const totalSpots = capacity.reduce((sum, r) => sum + r.capacity, 0)
  const occupied = capacity.reduce((sum, r) => sum + r.occupied, 0)
  const utilisation = totalSpots ? Math.round((occupied / totalSpots) * 100) : 0
  const load = utilisationLoad(utilisation)
  const peakArea = capacity.reduce(
    (best, r) =>
      r.capacity && (!best || r.occupied / r.capacity > best.occupied / best.capacity) ? r : best,
    capacity[0],
  )
  const peakAreaPct =
    peakArea && peakArea.capacity ? Math.round((peakArea.occupied / peakArea.capacity) * 100) : 0

  const dwells = fleet
    .map((v) => hoursBetween(v.properties.ata, v.properties.etd))
    .filter((h): h is number => h != null && h > 0)
  const avgDwell = dwells.length
    ? Math.round((dwells.reduce((a, b) => a + b, 0) / dwells.length) * 10) / 10
    : 0

  const peakCalls = Math.max(...MONTHLY.map((m) => m.calls), FORECAST.calls)
  const gridSteps = [100, 75, 50, 25, 0]

  function generate() {
    const next: GeneratedReport = {
      id: `RPT-${String(913 + history.length - SEED.length).padStart(4, '0')}`,
      name: chosen?.name ?? template,
      range: rangeLabel,
      format,
      at: new Date().toISOString(),
      // What the filters actually selected, not the whole fleet.
      rows: filtered.length,
    }
    setHistory((h) => [next, ...h])
  }

  const payload = {
    report: { template, format: format.toLowerCase() },
    filters: {
      range,
      from: span.from == null ? null : new Date(span.from).toISOString(),
      to: span.to == null ? null : new Date(span.to).toISOString(),
      // Empty arrays read as "no constraint", matching the screen.
      areas: areaSel,
      flags: flagSel,
      vesselType: type === 'all' ? null : type,
    },
    matched: {
      vessels: filtered.length,
      ofFleet: fleet.length,
      avgPlannedStayHours: matchedAvgDwell,
      byArea: Object.fromEntries(matchedByArea),
      flags: [...new Set(filtered.map((v) => v.properties.flag))].sort(),
    },
    generatedAt: '2026-08-03T09:15:00Z',
    totals: {
      vesselsTracked: fleet.length,
      avgDwellHours: avgDwell,
      utilisationPct: utilisation,
      busiestArea: peakArea?.area.properties.code ?? null,
      incursions: incursions.length,
    },
    series: MONTHLY.map((m) => ({ month: m.m, calls: m.calls })),
    forecast: {
      model: 'prophet-occupancy',
      nextMonthCalls: FORECAST.calls,
      confidenceInterval: FORECAST.ci,
      drivers: ['seasonal bunker demand', 'berth 2 back in service'],
    },
    history,
  }

  return (
    <>
      {/* ---------------- builder ---------------- */}
      <section className="panel panel-wide">
        <h2>Build a report</h2>

        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`template-card${template === t.id ? ' selected' : ''}`}
              aria-pressed={template === t.id}
              onClick={() => setTemplate(t.id)}
            >
              <span className="template-icon">
                <Icon name={t.icon} size={17} />
              </span>
              <span className="template-text">
                <span className="template-name">{t.name}</span>
                <span className="template-desc">{t.desc}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="report-controls">
          <label>
            Date range
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          {/* Only asked for when the presets cannot say it. */}
          {range === 'custom' && (
            <>
              <label>
                From
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </>
          )}

          <label>
            Vessel type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All types</option>
              {VESSEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {VESSEL_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          {/* Beside the other constraints rather than in a band of its own —
              it is one filter among four, not a section. */}
          <label className="control-flag">
            Flag state
            <FlagFilter options={flagsPresent} selected={flagSel} onChange={setFlagSel} />
          </label>
          <label>
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="generate-button" onClick={generate}>
            Generate report
          </button>
        </div>

        <fieldset className="report-facet">
          <legend>Anchorage areas</legend>
          <div className="area-chips">
            {anchorages.map((a) => {
              const code = a.properties.code
              const on = areaSel.includes(code)
              return (
                <button
                  key={a.properties.id}
                  type="button"
                  className={`filter-chip chip-labelled${on ? ' active' : ''}`}
                  aria-pressed={on}
                  title={a.properties.name}
                  onClick={() => setAreaSel((prev) => toggle(prev, code))}
                >
                  {code}
                </button>
              )
            })}
          </div>
          <p className="facet-note muted">
            {areaSel.length ? `${areaSel.length} selected` : 'All areas'}
          </p>
        </fieldset>

        {/* What the dropdown chose, said plainly and removable one at a time —
            a filter you cannot see is a filter you forget you set. */}
        {flagSel.length > 0 && (
          <div className="area-chips flag-selection">
            {flagSel.map((code) => (
              <button
                key={code}
                type="button"
                className="filter-chip chip-labelled active flag-pill"
                title={`Remove ${flagName(code)}`}
                onClick={() => setFlagSel((prev) => toggle(prev, code))}
              >
                <FlagIcon code={code} size={12} />
                {flagName(code)}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}

        <p className="muted hint">
          {chosen?.name} · {rangeLabel}
          {span.from != null && ` (${isoDay(span.from)} → ${span.to != null ? isoDay(span.to) : 'now'})`}
          {span.from == null && span.to != null && ` (up to ${isoDay(span.to)})`}
          {' · '}
          {type === 'all' ? 'all vessel types' : VESSEL_LABELS[type as keyof typeof VESSEL_LABELS]}
          {' · '}
          {format}
          {facetCount > 0 && (
            <>
              {' · '}
              <button type="button" className="link-cell" onClick={clearFilters}>
                Clear {facetCount} filter{facetCount === 1 ? '' : 's'}
              </button>
            </>
          )}
        </p>
      </section>

      {/* ---------------- what the filters actually select ---------------- */}
      <section className="panel panel-wide">
        <h2>
          Report preview
          <span className={`badge badge-${filtered.length ? 'ok' : 'warn'}`}>
            {filtered.length} of {fleet.length}
          </span>
        </h2>
        <p className="muted">
          The rows this report would carry. Matched on arrival date, so a vessel with no ATA is
          outside every dated window.
        </p>

        {filtered.length > 0 && (
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-value">{filtered.length}</span>
              <span className="stat-label">Vessels matched</span>
            </div>
            <div className="stat">
              <span className="stat-value">{formatDuration(matchedAvgDwell)}</span>
              <span className="stat-label">Avg planned stay</span>
            </div>
            <div className="stat">
              <span className="stat-value">{matchedByArea.length}</span>
              <span className="stat-label">Areas covered</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {new Set(filtered.map((v) => v.properties.flag)).size}
              </span>
              <span className="stat-label">Flag states</span>
            </div>
          </div>
        )}

        {matchedByArea.length > 0 && (
          <div className="area-chips facet-breakdown">
            {matchedByArea.map(([code, n]) => (
              <span key={code} className="filter-chip chip-labelled">
                {code} · {n}
              </span>
            ))}
          </div>
        )}

        {/* Every match, not the first dozen. The container already scrolls at a
            fixed height with the header pinned, so a long result is a scroll
            rather than a page that grows without end — and "the file carries the
            rest" was asking the operator to export a report to find out what was
            in it. */}
        <div className="table-scroll report-rows">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th>Vessel</th>
                <th>IMO</th>
                <th>Type</th>
                <th>Flag</th>
                <th>Area</th>
                <th>Arrived</th>
                <th>Departs</th>
                <th>Planned stay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v, i) => {
                const p = v.properties
                return (
                  <tr key={p.id}>
                    {/* The row's place in the result, so a figure quoted off the
                        screen can be found again after a scroll. */}
                    <td className="col-num muted">{i + 1}</td>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td className="muted col-num">{p.imo || '—'}</td>
                    <td className="muted">{VESSEL_LABELS[p.type] ?? p.type}</td>
                    <td>
                      <span className="flag-cell">
                        <FlagIcon code={p.flag} size={13} />
                        {flagName(p.flag)}
                      </span>
                    </td>
                    <td>{p.area ?? '—'}</td>
                    <td className="muted">{formatDateTime(p.ata)}</td>
                    <td className="muted">{formatDateTime(p.etd)}</td>
                    <td className="muted">{formatDuration(hoursBetween(p.ata, p.etd))}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    Nothing matches these filters
                    {range !== 'all' && ' — try widening the date range'}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && (
          <p className="muted hint">
            All {rows.length} matching {rows.length === 1 ? 'vessel' : 'vessels'}, most recent
            arrival first. {format} export carries these same rows.
          </p>
        )}
      </section>

      {/* ---------------- period figures ---------------- */}
      <section className="panel">
        <h2>
          Period summary
          <span className={`badge badge-${load.tone}`}>{load.label}</span>
        </h2>
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-value">{fleet.length}</span>
            <span className="stat-label">Vessels tracked</span>
          </div>
          <div className="stat">
            <span className="stat-value">{avgDwell}</span>
            <span className="stat-label">Avg dwell (h)</span>
          </div>
          <div className={`stat stat-${load.tone}`}>
            <span className="stat-value">{utilisation}%</span>
            <span className="stat-label">Utilisation</span>
          </div>
          <div className={`stat${incursions.length ? ' stat-alert' : ''}`}>
            <span className="stat-value">{incursions.length}</span>
            <span className="stat-label">Zone incursions</span>
          </div>
        </div>
        <p className="muted hint">
          Live figures for the anchorage as it stands. Busiest area is{' '}
          <strong>{peakArea?.area.properties.code ?? '—'}</strong> at {peakAreaPct}%.
        </p>
      </section>

      {/* ---------------- throughput ---------------- */}
      <section className="panel">
        <h2>Port calls by month</h2>
        <div className="chart-frame">
          <div className="chart-axis" aria-hidden="true">
            {gridSteps.map((p) => (
              <span key={p}>{Math.round((peakCalls * p) / 100)}</span>
            ))}
          </div>
          <div className="chart-plot">
            <div className="chart-lines" aria-hidden="true">
              {gridSteps.map((p) => (
                <span key={p} />
              ))}
            </div>
            <div className="chart">
              {MONTHLY.map((m) => (
                <div key={m.m} className="chart-col">
                  <span className="chart-value">{m.calls}</span>
                  <div
                    className="chart-bar"
                    style={{ height: `${(m.calls / peakCalls) * 100}%` }}
                    title={`${m.m}: ${m.calls} calls`}
                  />
                  <span className="chart-label">{m.m}</span>
                </div>
              ))}
              <div className="chart-col">
                <span className="chart-value">{FORECAST.calls}</span>
                <div
                  className="chart-bar chart-bar-predicted"
                  style={{ height: `${(FORECAST.calls / peakCalls) * 100}%` }}
                  title={`${FORECAST.m}: ${FORECAST.calls} forecast`}
                />
                <span className="chart-label">{FORECAST.m}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="legend">
          <span>
            <span className="legend-swatch" /> Recorded
          </span>
          <span>
            <span className="legend-swatch legend-swatch-predicted" /> Forecast
          </span>
        </div>

        <div className="insight">
          <strong>Forecast</strong> {FORECAST.calls} calls next month (CI {FORECAST.ci[0]}–
          {FORECAST.ci[1]}), driven by seasonal bunker demand and Berth 2 returning to service.
        </div>
      </section>

      {/* ---------------- history ---------------- */}
      <section className="panel panel-wide">
        <h2>
          Generated reports
          <span className="badge badge-ok">{history.length}</span>
        </h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Report</th>
                <th>Range</th>
                <th>Format</th>
                <th>Rows</th>
                <th>Generated</th>
                <th aria-label="Download" />
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>
                    <code className="ref-cell">{r.id}</code>
                  </td>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td className="muted">{r.range}</td>
                  <td>
                    <span className="format-chip">{r.format}</span>
                  </td>
                  <td className="muted">{r.rows}</td>
                  <td className="muted">{formatDateTime(r.at)}</td>
                  <td>
                    <button type="button" className="link-cell">
                      Download
                    </button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No reports generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RawJson label="POST /api/reports/generate" data={payload} />
    </>
  )
}
