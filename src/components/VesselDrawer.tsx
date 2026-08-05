import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  selectNearestBerthByVessel,
  selectVesselAreaIndex,
  swingRadiusM,
} from '../features/analysis/selectors'
import { selectFeature } from '../features/selection/selectionSlice'
import { setTab } from '../features/ui/uiSlice'
import { focusVessel } from '../features/view/viewSlice'
import { formatDateTime, formatDistance, hoursBetween } from '../utils/format'
import { flagName } from '../utils/flags'
import { VESSEL_COLORS, VESSEL_LABELS, VESSEL_STATUS_SHORT } from '../map/vesselTypes'

interface Props {
  vesselId: string | null
  onClose: () => void
}

/**
 * Slide-over detail panel for one vessel. Overlays rather than reflows, so a
 * table behind it keeps its scroll position while an operator dips in and out
 * of individual contacts.
 */
export default function VesselDrawer({ vesselId, onClose }: Props) {
  const dispatch = useAppDispatch()
  const index = useAppSelector(selectVesselAreaIndex)
  const nearest = useAppSelector(selectNearestBerthByVessel)
  const swingFactor = useAppSelector((s) => s.analysis.swingFactor)
  const safetyMarginM = useAppSelector((s) => s.analysis.safetyMarginM)

  /* Esc closes, matching the map's detail card. */
  useEffect(() => {
    if (!vesselId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [vesselId, onClose])

  const entry = index.find((e) => e.vessel.properties.id === vesselId)
  if (!vesselId || !entry) return null

  const p = entry.vessel.properties
  const berth = nearest[p.id]
  const dwell = hoursBetween(p.ata, p.etd)
  const swingR = Math.round(swingRadiusM(p.lengthM, swingFactor, safetyMarginM))
  const [lon, lat] = entry.vessel.geometry.coordinates

  return (
    <>
      <button type="button" className="drawer-scrim" aria-label="Close details" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`${p.name} details`}>
        <header className="drawer-head">
          <span className="dot" style={{ background: VESSEL_COLORS[p.type] }} />
          <div className="drawer-title">
            <strong>{p.name}</strong>
            <span className="muted">
              IMO {p.imo} · {flagName(p.flag)} flag
            </span>
          </div>
          <span className={`pill pill-${p.status}`}>{VESSEL_STATUS_SHORT[p.status]}</span>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="drawer-body">
          <h4 className="drawer-section">Particulars</h4>
          <dl className="kv">
            <div>
              <dt>Type</dt>
              <dd>{VESSEL_LABELS[p.type]}</dd>
            </div>
            <div>
              <dt>LOA</dt>
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
          </dl>

          <h4 className="drawer-section">Position &amp; assignment</h4>
          <dl className="kv kv-wide">
            <div>
              <dt>Area</dt>
              <dd>
                {entry.areas.map((a) => a.properties.name).join(', ') || 'Outside declared areas'}
              </dd>
            </div>
            <div>
              <dt>Swing circle</dt>
              <dd>{swingR} m radius</dd>
            </div>
            <div>
              <dt>Nearest berth</dt>
              <dd>
                {berth
                  ? `${berth.berth.properties.name} · ${formatDistance(berth.distanceM)}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>
                {lat.toFixed(4)}°N, {lon.toFixed(4)}°E
              </dd>
            </div>
          </dl>

          <h4 className="drawer-section">Schedule</h4>
          <dl className="kv kv-wide">
            <div>
              <dt>Arrived</dt>
              <dd>{formatDateTime(p.ata) || '—'}</dd>
            </div>
            <div>
              <dt>Departs</dt>
              <dd>{formatDateTime(p.etd) || '—'}</dd>
            </div>
            <div>
              <dt>Dwell</dt>
              <dd>{dwell == null ? '—' : `${dwell} h`}</dd>
            </div>
            <div>
              <dt>Agent</dt>
              <dd>Gulf Marine Services</dd>
            </div>
          </dl>
        </div>

        <footer className="drawer-foot">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              dispatch(selectFeature({ layer: 'vessels', id: p.id }))
              dispatch(focusVessel(p.id))
              dispatch(setTab('tracking'))
            }}
          >
            Track on map
          </button>
          <button type="button" onClick={() => dispatch(setTab('vessel'))}>
            Full record
          </button>
        </footer>
      </aside>
    </>
  )
}
