import { useState } from 'react'
import { useAppSelector } from '../../app/hooks'
import { selectAreaCapacity, selectRestrictedIncursions } from '../../features/analysis/selectors'
import { formatDateTime, hoursBetween } from '../../utils/format'
import { utilisationLoad } from '../../utils/occupancyLoad'
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

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom…' },
]

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

  const [template, setTemplate] = useState('daily')
  const [range, setRange] = useState('last7')
  const [type, setType] = useState('all')
  const [format, setFormat] = useState('PDF')
  const [history, setHistory] = useState<GeneratedReport[]>(SEED)

  const chosen = TEMPLATES.find((t) => t.id === template)
  const rangeLabel = RANGES.find((r) => r.id === range)?.label ?? range

  /* --- period figures, derived from the live data rather than invented ---- */
  const fleet = vessels?.features ?? []
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
      rows: fleet.length,
    }
    setHistory((h) => [next, ...h])
  }

  const payload = {
    report: { template, range, vesselType: type, format: format.toLowerCase() },
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
          <label>
            Vessel type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All types</option>
              <option value="tanker">Tanker</option>
              <option value="container">Container</option>
              <option value="bulk">Bulk</option>
            </select>
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

        <p className="muted hint">
          {chosen?.name} · {rangeLabel} · {type === 'all' ? 'all vessel types' : type} · {format}
        </p>
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
