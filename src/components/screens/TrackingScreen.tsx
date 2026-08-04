import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { selectVesselAreaIndex } from '../../features/analysis/selectors'
import { selectFeature } from '../../features/selection/selectionSlice'
import RawJson from '../RawJson'
import { VESSEL_COLORS, VESSEL_LABELS } from '../../map/vesselTypes'

const STATUSES = ['all', 'moored', 'anchored', 'underway'] as const

/** Live vessel list with search + filters; selecting a row drives the map. */
export default function TrackingScreen() {
  const dispatch = useAppDispatch()
  const index = useAppSelector(selectVesselAreaIndex)
  const selected = useAppSelector((s) => s.selection.selected)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('all')

  const rows = useMemo(
    () =>
      index.filter(({ vessel }) => {
        const p = vessel.properties
        const matchesQuery =
          !query ||
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.imo.includes(query) ||
          p.type.includes(query.toLowerCase())
        return matchesQuery && (status === 'all' || p.status === status)
      }),
    [index, query, status],
  )

  const payload = {
    feed: 'ais.terrestrial',
    receivedAt: '2026-08-03T09:15:04Z',
    filters: { query: query || null, status },
    count: rows.length,
    vessels: rows.slice(0, 3).map(({ vessel, areas }) => ({
      ...vessel.properties,
      position: {
        lon: vessel.geometry.coordinates[0],
        lat: vessel.geometry.coordinates[1],
      },
      inAreas: areas.map((a) => a.properties.name),
      etd: '2026-08-03T18:40:00Z',
      nextMove: 'shift to Anchor Berth 4',
    })),
  }

  return (
    <>
      <section className="panel">
        <h2>Vessel tracking</h2>
        <input
          className="text-input"
          type="search"
          placeholder="Search name, IMO or type…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filter-row">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-chip${status === s ? ' active' : ''}`}
              onClick={() => setStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>
          Contacts<span className="badge badge-ok">{rows.length}</span>
        </h2>
        <ul className="track-list">
          {rows.map(({ vessel, areas }) => {
            const p = vessel.properties
            const isSelected = selected?.layer === 'vessels' && selected.id === p.id
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={isSelected ? 'selected' : ''}
                  onClick={() => dispatch(selectFeature({ layer: 'vessels', id: p.id }))}
                >
                  <span className="dot" style={{ background: VESSEL_COLORS[p.type] }} />
                  <span className="track-main">
                    <strong>{p.name}</strong>
                    <span className="muted">
                      {VESSEL_LABELS[p.type]} · {p.lengthM} × {p.beamM} m
                    </span>
                    <span className="muted">
                      {areas.length ? areas[0].properties.name : 'Outside declared areas'}
                    </span>
                  </span>
                  <span className="track-side">
                    <span className={`pill pill-${p.status}`}>{p.status}</span>
                    <span className="muted">{p.speedKn} kn</span>
                  </span>
                </button>
              </li>
            )
          })}
          {rows.length === 0 && <p className="muted">No vessel matches those filters.</p>}
        </ul>
      </section>

      <RawJson label="GET /api/vessels/live" data={payload} />
    </>
  )
}
