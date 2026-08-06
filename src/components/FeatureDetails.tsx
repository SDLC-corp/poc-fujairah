import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  selectGeofences,
  selectNearestBerthByVessel,
  selectVesselAreaIndex,
  swingRadiusM,
} from '../features/analysis/selectors'
import { VESSEL_LABELS } from '../map/vesselTypes'
import type { VesselType } from '../types/gis'
import { clearSelection } from '../features/selection/selectionSlice'
import { formatDistance, titleCase } from '../utils/format'
import type { LayerId } from '../types/gis'

const LAYER_TITLE: Record<LayerId, string> = {
  vessels: 'Vessel',
  anchorages: 'Anchorage area',
  swing: 'Swing circle',
  freeSpots: 'Available spot',
  geofences: 'Geofence',
}

/** Floating card describing whatever is currently selected on the map. */
export default function FeatureDetails() {
  const dispatch = useAppDispatch()
  const selected = useAppSelector((s) => s.selection.selected)
  const vessels = useAppSelector((s) => s.portData.vessels)
  const anchorages = useAppSelector((s) => s.portData.anchorages)
  const geofences = useAppSelector(selectGeofences)
  const areaIndex = useAppSelector(selectVesselAreaIndex)
  const nearest = useAppSelector(selectNearestBerthByVessel)
  const swingFactor = useAppSelector((s) => s.analysis.swingFactor)
  const safetyMarginM = useAppSelector((s) => s.analysis.safetyMarginM)

  if (!selected) return null

  const collection = { anchorages, vessels, swing: vessels, freeSpots: null, geofences }[
    selected.layer
  ]
  const feature = collection?.features.find((f) => f.properties.id === selected.id)
  if (!feature) return null

  const props = feature.properties as Record<string, unknown>
  const rows = Object.entries(props).filter(([key]) => key !== 'id' && key !== 'name')

  const containment =
    selected.layer === 'vessels'
      ? (areaIndex.find((entry) => entry.vessel.properties.id === selected.id)?.areas ?? [])
      : []
  const nearestBerth = selected.layer === 'vessels' ? nearest[selected.id] : undefined

  const loa = typeof props.lengthM === 'number' ? props.lengthM : null
  const swingR = loa == null ? null : swingRadiusM(loa, swingFactor, safetyMarginM)
  const swingAreaM2 = swingR == null ? null : Math.PI * swingR * swingR

  return (
    <aside className="details-card">
      <header>
        <div>
          <span className="details-kind">{LAYER_TITLE[selected.layer]}</span>
          <h3>{String(props.name ?? selected.id)}</h3>
        </div>
        <button type="button" className="close" onClick={() => dispatch(clearSelection())}>
          ×
        </button>
      </header>

      <dl>
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{titleCase(key.replace(/([A-Z])/g, ' $1').trim())}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>

      {selected.layer === 'vessels' && swingR != null && (
        <div className="swing-box">
          <div className="swing-head">
            <span>Swing circle</span>
            <strong>{Math.round(swingR)} m</strong>
          </div>
          <dl className="swing-kv">
            <div>
              <dt>LOA</dt>
              <dd>{loa} m</dd>
            </div>
            <div>
              <dt>Factor</dt>
              <dd>x{swingFactor}</dd>
            </div>
            <div>
              <dt>Margin</dt>
              <dd>{safetyMarginM} m</dd>
            </div>
            <div>
              <dt>Diameter</dt>
              <dd>{Math.round(swingR * 2)} m</dd>
            </div>
            <div>
              <dt>Safe area</dt>
              <dd>{((swingAreaM2 ?? 0) / 10000).toFixed(1)} ha</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{VESSEL_LABELS[props.type as VesselType] ?? String(props.type)}</dd>
            </div>
          </dl>
        </div>
      )}

      {selected.layer === 'vessels' && (
        <div className="details-analysis">
          <p>
            <span className="muted">Inside area</span>{' '}
            {containment.length
              ? containment.map((a) => a.properties.name).join(', ')
              : 'Outside declared areas'}
          </p>
          {nearestBerth && (
            <p>
              <span className="muted">Nearest anchor berth</span>{' '}
              {nearestBerth.berth.properties.name} ·{' '}
              {formatDistance(nearestBerth.distanceM)}
            </p>
          )}
        </div>
      )}
    </aside>
  )
}
