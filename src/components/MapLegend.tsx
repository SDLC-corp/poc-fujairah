import { useAppSelector } from '../app/hooks'
import { selectAreas } from '../features/analysis/selectors'
import { AREA_COLORS } from '../map/areaColors'
import { VESSEL_COLORS, VESSEL_LABELS, VESSEL_TYPES } from '../map/vesselTypes'

/**
 * Map key: what each area code means and what each vessel colour is. Both lists
 * read from the same constants the map styles itself with.
 */
export default function MapLegend() {
  const areas = useAppSelector(selectAreas)

  return (
    <details className="map-legend">
      <summary>Legend</summary>
      <div className="map-legend-body">
        <h4>Anchorage areas</h4>
        <ul className="legend-list">
          {areas.map((a) => (
            <li key={a.properties.id} title={a.properties.purpose}>
              <span
                className="legend-chip"
                style={{ background: AREA_COLORS[a.properties.code] ?? '#0369a1' }}
              >
                {a.properties.code}
              </span>
              <span className="legend-name">
                {a.properties.name.replace('Anchorage Area ', 'Area ')}
              </span>
            </li>
          ))}
        </ul>

        <h4>Vessel types</h4>
        <ul className="legend-list legend-list-swatch">
          {VESSEL_TYPES.map((t) => (
            <li key={t}>
              <span className="legend-swatch-sq" style={{ background: VESSEL_COLORS[t] }} />
              <span className="legend-name">{VESSEL_LABELS[t]}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
