import { useState } from 'react'
import LayerPanel from '../LayerPanel'
import SwingPanel from '../SwingPanel'
import ViewPanel from '../ViewPanel'
import RawJson from '../RawJson'

const ROLES = [
  { role: 'VTS operator', users: 6, scope: 'Assign, track, report' },
  { role: 'Harbour master', users: 2, scope: 'Full access' },
  { role: 'Agent', users: 24, scope: 'Read own vessels' },
  { role: 'Auditor', users: 3, scope: 'Read-only + exports' },
]

export default function SettingsScreen() {
  const [email, setEmail] = useState(true)
  const [sms, setSms] = useState(false)
  const [push, setPush] = useState(true)
  const [units, setUnits] = useState('metric')
  const [defaultView, setDefaultView] = useState('port')

  const payload = {
    user: {
      id: 'usr_2841',
      name: 'Operations Console',
      email: 'ops@portoffujairah.ae',
      role: 'VTS operator',
      lastLogin: '2026-08-03T06:02:11Z',
    },
    notifications: { email, sms, push, thresholds: { occupancyPct: 85, incursion: true } },
    system: { units, defaultView, basemap: 'maptiler-streets-v2', refreshSeconds: 30 },
    accessControl: ROLES,
  }

  return (
    <>
      <section className="panel">
        <h2>Profile</h2>
        <div className="profile">
          <span className="avatar">OC</span>
          <div>
            <strong>Operations Console</strong>
            <span className="muted">ops@portoffujairah.ae · VTS operator</span>
          </div>
        </div>
        <div className="form-row form-row-stack">
          <label>
            Contact number
            <input className="text-input" type="tel" defaultValue="+971 9 228 xxxx" />
          </label>
        </div>
        <div className="export-row">
          <button type="button" className="ghost-button">
            Change password
          </button>
          <button type="button" className="ghost-button">
            Update contact
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Notifications</h2>
        <label className="switch">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
          <span>
            Email alerts
            <small>Zone incursions and occupancy thresholds</small>
          </span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />
          <span>
            SMS notifications
            <small>High-severity events only</small>
          </span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
          <span>
            Desktop push
            <small>Live while the console is open</small>
          </span>
        </label>
      </section>

      {/* Live map configuration — the "map settings / default view" part of this screen. */}
      <LayerPanel />
      <SwingPanel />
      <ViewPanel />

      <section className="panel">
        <h2>System</h2>
        <div className="form-row">
          <label>
            Units
            <select value={units} onChange={(e) => setUnits(e.target.value)}>
              <option value="metric">Metric (m, km)</option>
              <option value="nautical">Nautical (nm, kn)</option>
            </select>
          </label>
          <label>
            Default view
            <select value={defaultView} onChange={(e) => setDefaultView(e.target.value)}>
              <option value="port">Port overview</option>
              <option value="anchorage">Anchorage</option>
              <option value="channel">Approach channel</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Access control</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Users</th>
              <th>Scope</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r.role}>
                <td>
                  <strong>{r.role}</strong>
                </td>
                <td>{r.users}</td>
                <td className="muted">{r.scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <RawJson label="GET /api/settings" data={payload} />
    </>
  )
}
