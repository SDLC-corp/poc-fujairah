import { useState } from 'react'
import RawJson from '../RawJson'

const MONTHLY = [
  { m: 'Mar', calls: 61 },
  { m: 'Apr', calls: 74 },
  { m: 'May', calls: 68 },
  { m: 'Jun', calls: 82 },
  { m: 'Jul', calls: 91 },
  { m: 'Aug', calls: 44 },
]

const TEMPLATES = [
  { id: 'hourly', name: 'Hourly occupancy', desc: 'Spot-by-spot utilisation, 24 h' },
  { id: 'daily', name: 'Daily summary', desc: 'Calls, moves, dwell time, incidents' },
  { id: 'monthly', name: 'Monthly trends', desc: 'Throughput and utilisation by month' },
  { id: 'zone', name: 'Zone incursions', desc: 'Restricted-zone entries with duration' },
]

export default function ReportsScreen() {
  const [template, setTemplate] = useState('daily')
  const [range, setRange] = useState('last7')
  const [type, setType] = useState('all')
  const peak = Math.max(...MONTHLY.map((m) => m.calls))

  const payload = {
    report: { template, range, vesselType: type, format: 'json' },
    generatedAt: '2026-08-03T09:15:00Z',
    totals: { calls: 420, avgDwellHours: 50.4, peakUtilisationPct: 91, incursions: 7 },
    series: MONTHLY.map((m) => ({ month: m.m, calls: m.calls })),
    forecast: {
      model: 'prophet-occupancy',
      nextMonthCalls: 96,
      confidenceInterval: [88, 104],
      drivers: ['seasonal bunker demand', 'berth 2 back in service'],
    },
  }

  return (
    <>
      <section className="panel">
        <h2>Report options</h2>
        <div className="form-row">
          <label>
            Date range
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="today">Today</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="custom">Custom…</option>
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
        </div>
        <div className="export-row">
          <button type="button" className="ghost-button">
            Export PDF
          </button>
          <button type="button" className="ghost-button">
            Export Excel
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Port calls by month</h2>
        <div className="chart">
          {MONTHLY.map((m) => (
            <div key={m.m} className="chart-col">
              <div
                className="chart-bar"
                style={{ height: `${(m.calls / peak) * 100}%` }}
                title={`${m.m}: ${m.calls} calls`}
              />
              <span className="chart-label">{m.m}</span>
            </div>
          ))}
        </div>
        <div className="insight">
          <strong>Forecast</strong> 96 calls next month (CI 88–104), driven by seasonal bunker
          demand and Berth 2 returning to service.
        </div>
      </section>

      <section className="panel">
        <h2>Templates</h2>
        <ul className="option-list">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={template === t.id ? 'selected' : ''}
                onClick={() => setTemplate(t.id)}
              >
                <span>
                  <strong>{t.name}</strong>
                  <span className="muted">{t.desc}</span>
                </span>
                <span className="option-check">{template === t.id ? '✓' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <RawJson label="POST /api/reports/generate" data={payload} />
    </>
  )
}
