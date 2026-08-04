import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { selectAreaCapacity, selectVesselAreaIndex } from '../../features/analysis/selectors'
import { selectFeature } from '../../features/selection/selectionSlice'
import { formatDateTime, hoursBetween } from '../../utils/format'
import { buildOccupancySeries } from '../../utils/occupancyCurve'
import OccupancyWave from '../OccupancyWave'
import RawJson from '../RawJson'

export default function OccupancyScreen() {
  const dispatch = useAppDispatch()
  const capacity = useAppSelector(selectAreaCapacity)
  const index = useAppSelector(selectVesselAreaIndex)
  const [areaFilter, setAreaFilter] = useState('all')

  const totalSpots = capacity.reduce((sum, r) => sum + r.capacity, 0)
  const occupied = capacity.reduce((sum, r) => sum + r.occupied, 0)
  const utilisation = totalSpots ? Math.round((occupied / totalSpots) * 100) : 0

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
        <h2>Occupancy now</h2>
        <div className="stat-grid">
          <div className="stat">
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
      </section>

      <section className="panel panel-span2">
        <h2>Current &amp; predicted occupancy</h2>
        <OccupancyWave series={series} />
</section>

      <section className="panel">
        <h2>Occupancy by area</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Occupied</th>
              <th>Capacity</th>
              <th>Free</th>
            </tr>
          </thead>
          <tbody>
            {capacity.map((r) => (
              <tr key={r.area.properties.id}>
                <td>
                  <strong>{r.area.properties.code}</strong>
                </td>
                <td>{r.occupied}</td>
                <td className="muted">{r.capacity}</td>
                <td className="muted">{r.available}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
          <table className="data-table">
            <thead>
              <tr>
                <th>Vessel</th>
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
                  <tr key={p.id}>
                    <td>
                      <button
                        type="button"
                        className="link-cell"
                        onClick={() => dispatch(selectFeature({ layer: 'vessels', id: p.id }))}
                      >
                        {p.name}
                      </button>
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
            </tbody>
          </table>
        </div>
      </section>

      <RawJson label="GET /api/occupancy/forecast" data={payload} />
    </>
  )
}
