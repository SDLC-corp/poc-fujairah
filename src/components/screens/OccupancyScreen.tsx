import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  selectAreaCapacity,
  selectPortTotals,
  selectVesselAreaIndex,
} from '../../features/analysis/selectors'
import { selectFeature } from '../../features/selection/selectionSlice'
import { formatDateTime, hoursBetween } from '../../utils/format'
import { buildOccupancySeries } from '../../utils/occupancyCurve'
import { OCCUPANCY_ALERT_PCT, utilisationLoad } from '../../utils/occupancyLoad'
import { AREA_COLORS } from '../../map/areaColors'
import { VESSEL_COLORS, VESSEL_LABELS, VESSEL_STATUS_SHORT } from '../../map/vesselTypes'
import OccupancyWave from '../OccupancyWave'
import RawJson from '../RawJson'
import VesselDrawer from '../VesselDrawer'

export default function OccupancyScreen() {
  const dispatch = useAppDispatch()
  const capacity = useAppSelector(selectAreaCapacity)
  const index = useAppSelector(selectVesselAreaIndex)
  const [areaFilter, setAreaFilter] = useState('all')
  /** Which vessel the slide-over is showing; independent of map selection. */
  const [openVessel, setOpenVessel] = useState<string | null>(null)

  const { capacity: totalSpots, occupied, utilisationPct: utilisation } =
    useAppSelector(selectPortTotals)
  const load = utilisationLoad(utilisation)

  /* --- occupancy chart: measured now, projected forward ------------------ */
  const series = buildOccupancySeries(utilisation)
  const peak = series.reduce((best, p) => (p.pct > best.pct ? p : best), series[0])

  /* --- currently parked vessels ------------------------------------------ */
  const parked = useMemo(
    () =>
      index
        .filter((e) => e.vessel.properties.status === 'anchored')
        .map((e) => {
          const spot = e.areas.find((a) => a.properties.category === 'anchorage')
          return { vessel: e.vessel, spot: spot?.properties.code ?? '—', spotId: spot?.properties.id }
        })
        .filter((row) => areaFilter === 'all' || row.spot === areaFilter)
        .sort(
          (a, b) =>
            new Date(a.vessel.properties.etd ?? 0).getTime() -
            new Date(b.vessel.properties.etd ?? 0).getTime(),
        ),
    [index, areaFilter],
  )

  const areaCodes = capacity.map((r) => r.area.properties.code)

  /* --- where the pressure actually is ------------------------------------ */
  const pct = (r: (typeof capacity)[number]) => (r.capacity ? r.occupied / r.capacity : 0)
  const fullest = capacity.reduce<(typeof capacity)[number] | null>(
    (best, r) => (!best || pct(r) > pct(best) ? r : best),
    null,
  )
  const roomiest = capacity.reduce<(typeof capacity)[number] | null>(
    (best, r) => (!best || r.available > best.available ? r : best),
    null,
  )
  const overThreshold = capacity.filter((r) => pct(r) >= OCCUPANCY_ALERT_PCT / 100).length
  const fullAreas = capacity.filter((r) => r.capacity > 0 && r.available === 0).length

  function openVesselRow(id: string) {
    dispatch(selectFeature({ layer: 'vessels', id }))
    setOpenVessel(id)
  }

  const payload = {
    asOf: '2026-08-03T09:15:00Z',
    current: { spots: totalSpots, occupied, utilisationPct: utilisation },
    forecast: series.map((p) => ({ time: p.time, utilisationPct: p.pct, kind: p.kind })),
    model: { name: 'occupancy-lstm', version: '0.4.2', horizonHours: 12, mape: 0.081 },
    parked: parked.slice(0, 3).map((row) => ({
      vesselId: row.vessel.properties.id,
      vessel: row.vessel.properties.name,
      spot: row.spot,
      ata: row.vessel.properties.ata,
      etd: row.vessel.properties.etd,
      dwellHours: hoursBetween(row.vessel.properties.ata, row.vessel.properties.etd),
    })),
  }

  return (
    <>
      <section className="panel">
        <h2>
          Occupancy now
          <span className={`badge badge-${load.tone}`}>{load.label}</span>
        </h2>
        <div className="stat-grid">
          <div className={`stat stat-${load.tone}`}>
            <span className="stat-value">{utilisation}%</span>
            <span className="stat-label">Utilisation</span>
          </div>
          <div className="stat">
            <span className="stat-value">{peak.pct}%</span>
            <span className="stat-label">Peak forecast {peak.time}</span>
          </div>
          <div className="stat">
            <span className="stat-value">{occupied}</span>
            <span className="stat-label">Spots occupied</span>
          </div>
          <div className="stat">
            <span className="stat-value">{totalSpots - occupied}</span>
            <span className="stat-label">Spots available</span>
          </div>
        </div>

        <div className={`meter ${load.className}`}>
          <div className="meter-head">
            <span>Anchorage utilisation</span>
            <span className="meter-state">{load.label}</span>
            <strong>{utilisation}%</strong>
          </div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${utilisation}%` }} />
          </div>
        </div>

        <h3 className="sub-head">Pressure points</h3>
        <ul className="fact-list">
          <li>
            <span className="fact-label">Fullest area</span>
            <span className="fact-value">
              {fullest ? (
                <>
                  <strong>{fullest.area.properties.code}</strong>
                  <span className="muted">
                    {' '}
                    {fullest.occupied}/{fullest.capacity} · {Math.round(pct(fullest) * 100)}%
                  </span>
                </>
              ) : (
                '—'
              )}
            </span>
          </li>
          <li>
            <span className="fact-label">Most room</span>
            <span className="fact-value">
              {roomiest ? (
                <>
                  <strong>{roomiest.area.properties.code}</strong>
                  <span className="muted"> {roomiest.available} spots free</span>
                </>
              ) : (
                '—'
              )}
            </span>
          </li>
          <li>
            <span className="fact-label">Areas over {OCCUPANCY_ALERT_PCT}%</span>
            <span className={`fact-value${overThreshold ? ' fact-warn' : ''}`}>
              <strong>{overThreshold}</strong>
              <span className="muted"> of {capacity.length}</span>
            </span>
          </li>
          <li>
            <span className="fact-label">Areas full</span>
            <span className={`fact-value${fullAreas ? ' fact-alert' : ''}`}>
              <strong>{fullAreas}</strong>
              <span className="muted"> no spots left</span>
            </span>
          </li>
          <li>
            <span className="fact-label">Forecast peak</span>
            <span className="fact-value">
              <strong>{peak.pct}%</strong>
              <span className="muted"> at {peak.time}</span>
            </span>
          </li>
        </ul>
      </section>

      <section className="panel panel-span2">
        <h2>Current &amp; predicted occupancy</h2>
        <OccupancyWave series={series} />
      </section>

      <section className="panel">
        <h2>
          Occupancy by area
          <span className="badge badge-ok">{capacity.length}</span>
        </h2>
        <p className="muted hint">Pick an area to filter the vessel list.</p>
        <ul className="area-list">
          {capacity.map((r) => {
            const code = r.area.properties.code
            const pct = r.capacity ? Math.round((r.occupied / r.capacity) * 100) : 0
            const rowLoad = utilisationLoad(pct)
            const active = areaFilter === code
            return (
              <li key={r.area.properties.id}>
                <button
                  type="button"
                  className={`area-row${active ? ' active' : ''}`}
                  aria-pressed={active}
                  onClick={() => setAreaFilter(active ? 'all' : code)}
                >
                  <span className="area-code">
                    <span
                      className="area-swatch"
                      style={{ background: AREA_COLORS[code] ?? 'var(--navy-500)' }}
                    />
                    {code}
                  </span>
                  <span className={`area-meter meter-${rowLoad.tone}`}>
                    <span className="area-meter-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="area-pct">{pct}%</span>
                  <span className="area-counts">
                    <strong>{r.occupied}</strong>
                    <span className="muted">/{r.capacity}</span>
                  </span>
                  <span className={`area-free${r.available === 0 ? ' area-free-none' : ''}`}>
                    {r.available === 0 ? 'full' : `${r.available} free`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel panel-wide">
        <h2>
          Currently parked vessels
          <span className="badge badge-ok">{parked.length}</span>
        </h2>
        <div className="filter-row">
          <button
            type="button"
            className={`filter-chip${areaFilter === 'all' ? ' active' : ''}`}
            onClick={() => setAreaFilter('all')}
          >
            all
          </button>
          {areaCodes.map((code) => (
            <button
              key={code}
              type="button"
              className={`filter-chip${areaFilter === code ? ' active' : ''}`}
              onClick={() => setAreaFilter(code)}
            >
              {code}
            </button>
          ))}
        </div>

        <div className="table-scroll">
          <table className="data-table table-rows">
            <thead>
              <tr>
                <th>Vessel</th>
                <th>Status</th>
                <th>Spot</th>
                <th>Arrived</th>
                <th>Departs</th>
                <th>Dwell</th>
              </tr>
            </thead>
            <tbody>
              {parked.map((row) => {
                const p = row.vessel.properties
                const dwell = hoursBetween(p.ata, p.etd)
                return (
                  <tr
                    key={p.id}
                    className={openVessel === p.id ? 'row-open' : undefined}
                    onClick={() => openVesselRow(p.id)}
                  >
                    <td>
                      <button type="button" className="link-cell vessel-cell">
                        <span className="dot" style={{ background: VESSEL_COLORS[p.type] }} />
                        <span className="vessel-cell-text">
                          <strong>{p.name}</strong>
                          <span className="muted">{VESSEL_LABELS[p.type]}</span>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className={`pill pill-${p.status}`}>
                        {VESSEL_STATUS_SHORT[p.status]}
                      </span>
                    </td>
                    <td>
                      <strong>{row.spot}</strong>
                    </td>
                    <td className="muted">{formatDateTime(p.ata)}</td>
                    <td className="muted">{formatDateTime(p.etd)}</td>
                    <td className="muted">{dwell == null ? '—' : `${dwell} h`}</td>
                  </tr>
                )
              })}
              {parked.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No vessel is parked in that area.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <RawJson label="GET /api/occupancy/forecast" data={payload} />

      <VesselDrawer vesselId={openVessel} onClose={() => setOpenVessel(null)} />
    </>
  )
}
