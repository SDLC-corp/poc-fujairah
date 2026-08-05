import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  selectNearestBerthByVessel,
  selectVesselAreaIndex,
  swingRadiusM,
} from '../../features/analysis/selectors'
import { selectFeature } from '../../features/selection/selectionSlice'
import { focusVessel } from '../../features/view/viewSlice'
import { setTab } from '../../features/ui/uiSlice'
import { formatArea, formatDistance } from '../../utils/format'
import { flagName } from '../../utils/flags'
import MapView from '../MapView'
import MapFocusControl from '../MapFocusControl'
import RawJson from '../RawJson'
import {
  VESSEL_COLORS,
  VESSEL_LABELS,
  VESSEL_STATUS_LABELS,
  VESSEL_STATUS_SHORT,
} from '../../map/vesselTypes'

const STATUSES = ['all', 'moored', 'anchored', 'underway', 'awaiting'] as const

const STATUS_FILTER_LABELS: Record<(typeof STATUSES)[number], string> = {
  all: 'All',
  ...VESSEL_STATUS_LABELS,
}

/**
 * Two-column tracking workspace: search and the contact list on the left, the
 * map and the selected vessel's details on the right. Picking a row selects the
 * vessel everywhere and flies the camera to it.
 */
export default function TrackingScreen() {
  const dispatch = useAppDispatch()
  const index = useAppSelector(selectVesselAreaIndex)
  const nearest = useAppSelector(selectNearestBerthByVessel)
  const selected = useAppSelector((s) => s.selection.selected)
  const swingFactor = useAppSelector((s) => s.analysis.swingFactor)
  const safetyMarginM = useAppSelector((s) => s.analysis.safetyMarginM)
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

  /** Falls back to the first contact so the detail pane is never blank. */
  const active =
    index.find((e) => selected?.layer === 'vessels' && e.vessel.properties.id === selected.id) ??
    rows[0] ??
    index[0]

  function pick(id: string) {
    dispatch(selectFeature({ layer: 'vessels', id }))
    dispatch(focusVessel(id))
  }

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

  const p = active?.vessel.properties
  const berth = p ? nearest[p.id] : undefined
  /* The swing circle is the water this vessel actually occupies — its spot. */
  const swingR = p ? swingRadiusM(p.lengthM, swingFactor, safetyMarginM) : 0
  const anchorage = active?.areas.find((a) => a.properties.category === 'anchorage')

  return (
    <div className="track-layout">
      {/* ---------- left: search, then the contact list ---------- */}
      <div className="track-col">
        <section className="panel track-search">
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
                className={`filter-chip chip-labelled${status === s ? ' active' : ''}`}
                onClick={() => setStatus(s)}
              >
                {STATUS_FILTER_LABELS[s]}
              </button>
            ))}
          </div>
        </section>

        <section className="panel track-results">
          <h2>
            Contacts<span className="badge badge-ok">{rows.length}</span>
          </h2>
          <div className="track-scroll">
            <ul className="track-list">
              {rows.map(({ vessel, areas }) => {
                const row = vessel.properties
                const isSelected = selected?.layer === 'vessels' && selected.id === row.id
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={isSelected ? 'selected' : ''}
                      onClick={() => pick(row.id)}
                    >
                      <span className="dot" style={{ background: VESSEL_COLORS[row.type] }} />
                      <span className="track-main">
                        <strong>{row.name}</strong>
                        <span className="muted">
                          {VESSEL_LABELS[row.type]} · {row.lengthM} × {row.beamM} m
                        </span>
                        <span className="muted">
                          {areas.length ? areas[0].properties.name : 'Outside declared areas'}
                        </span>
                      </span>
                      <span className="track-side">
                        <span className={`pill pill-${row.status}`}>
                          {VESSEL_STATUS_SHORT[row.status]}
                        </span>
                        <span className="muted">{row.speedKn} kn</span>
                      </span>
                    </button>
                  </li>
                )
              })}
              {rows.length === 0 && <p className="muted">No vessel matches those filters.</p>}
            </ul>
          </div>
        </section>
      </div>

      {/* ---------- right: map above, selected vessel's details below ---------- */}
      <div className="track-col">
        <div className="track-map">
          <MapView />
          <MapFocusControl />
        </div>

        <section className="panel track-detail">
          {p && active ? (
            <>
              <div className="track-detail-head">
                <span className="dot" style={{ background: VESSEL_COLORS[p.type] }} />
                <div className="track-detail-name">
                  <strong>{p.name}</strong>
                  <span className="muted">
                    IMO {p.imo} · {flagName(p.flag)} flag · {VESSEL_LABELS[p.type]}
                  </span>
                </div>
                <span className={`pill pill-${p.status}`}>{VESSEL_STATUS_SHORT[p.status]}</span>
                <button
                  type="button"
                  className="track-detail-more"
                  onClick={() => dispatch(setTab('vessel'))}
                >
                  Full details
                </button>
              </div>

              <div className="track-scroll">
                <h3 className="sub-head">Dimensions</h3>
                <dl className="kv">
                  <div>
                    <dt>Length (LOA)</dt>
                    <dd>{p.lengthM} m</dd>
                  </div>
                  <div>
                    <dt>Beam</dt>
                    <dd>{p.beamM} m</dd>
                  </div>
                  <div>
                    <dt>Draft</dt>
                    <dd>{p.draftM} m</dd>
                  </div>
                  <div>
                    <dt>Speed</dt>
                    <dd>{p.speedKn} kn</dd>
                  </div>
                  <div>
                    <dt>Heading</dt>
                    <dd>{p.headingDeg}°</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{VESSEL_LABELS[p.type]}</dd>
                  </div>
                </dl>

                <h3 className="sub-head">Anchorage &amp; spot</h3>
                <dl className="kv kv-wide">
                  <div>
                    <dt>Anchorage area</dt>
                    <dd>{anchorage ? anchorage.properties.name : 'Outside declared areas'}</dd>
                  </div>
                  <div>
                    <dt>Area code</dt>
                    <dd>{anchorage?.properties.code ?? p.area ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Nearest anchor berth</dt>
                    <dd>{berth ? berth.berth.properties.name : '—'}</dd>
                  </div>
                  <div>
                    <dt>Distance to berth</dt>
                    <dd>{berth ? formatDistance(berth.distanceM) : '—'}</dd>
                  </div>
                  <div className="kv-span">
                    <dt>Also inside</dt>
                    <dd>
                      {active.areas
                        .filter((a) => a.properties.category !== 'anchorage')
                        .map((a) => a.properties.name)
                        .join(', ') || 'No other declared area'}
                    </dd>
                  </div>
                  <div className="kv-span">
                    <dt>Position</dt>
                    <dd>
                      {active.vessel.geometry.coordinates[1].toFixed(5)}°N,{' '}
                      {active.vessel.geometry.coordinates[0].toFixed(5)}°E
                    </dd>
                  </div>
                </dl>

                <div className="swing-box">
                  <div className="swing-head">
                    <span>Swing circle — the spot it occupies</span>
                    <strong>{Math.round(swingR)} m</strong>
                  </div>
                  <dl className="swing-kv">
                    <div>
                      <dt>Radius</dt>
                      <dd>{Math.round(swingR)} m</dd>
                    </div>
                    <div>
                      <dt>Diameter</dt>
                      <dd>{Math.round(swingR * 2)} m</dd>
                    </div>
                    <div>
                      <dt>LOA</dt>
                      <dd>{p.lengthM} m</dd>
                    </div>
                    <div>
                      <dt>Factor</dt>
                      <dd>×{swingFactor}</dd>
                    </div>
                    <div>
                      <dt>Safety margin</dt>
                      <dd>{safetyMarginM} m</dd>
                    </div>
                    <div>
                      <dt>Swept area</dt>
                      <dd>{formatArea(Math.PI * swingR * swingR)}</dd>
                    </div>
                  </dl>
                  <p className="muted hint">
                    LOA × {swingFactor} + {safetyMarginM} m margin. Adjust on the Settings screen.
                  </p>
                </div>

                <RawJson label="GET /api/vessels/live" data={payload} />
              </div>
            </>
          ) : (
            <p className="muted">No vessel data loaded.</p>
          )}
        </section>
      </div>
    </div>
  )
}
