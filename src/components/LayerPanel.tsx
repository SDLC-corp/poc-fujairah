import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  setBuildings3d,
  setMapNames,
  setVessels3d,
  toggleLayer,
} from '../features/layers/layersSlice'
import type { LayerId } from '../types/gis'
import { COMPASS_INK } from '../map/compassRose'
import { CONTOUR_INK, GRATICULE_INK, SOUNDING_INK } from '../map/layers'

const LAYERS: { id: LayerId; label: string; swatch: string }[] = [
  { id: 'anchorages', label: 'Anchorage areas (FAA)', swatch: '#e03b32' },
  { id: 'vessels', label: 'Vessels (AIS snapshot)', swatch: '#8A2BE2' },
  { id: 'swing', label: 'Swing circles', swatch: '#334155' },
  { id: 'freeSpots', label: 'Available spots', swatch: '#16a34a' },
  { id: 'geofences', label: 'Geofences (incidents)', swatch: '#dc2626' },
  // Chart furniture is backdrop, so it sits at the foot of the list — and under
  // the spots and vessels on the map.
  { id: 'contours', label: 'Depth contours (10 m)', swatch: CONTOUR_INK },
  { id: 'soundings', label: 'Spot soundings', swatch: SOUNDING_INK },
  { id: 'graticule', label: 'Graticule (1′ = 1 NM)', swatch: GRATICULE_INK },
  { id: 'compass', label: 'Compass rose', swatch: COMPASS_INK },
]

export default function LayerPanel() {
  const dispatch = useAppDispatch()
  const visible = useAppSelector((s) => s.layers.visible)
  const vessels3d = useAppSelector((s) => s.layers.vessels3d)
  const buildings3d = useAppSelector((s) => s.layers.buildings3d)
  const mapNames = useAppSelector((s) => s.layers.mapNames)

  return (
    <section className="panel">
      <h2>Layers</h2>
      <ul className="layer-list">
        {LAYERS.map((layer) => (
          <li key={layer.id}>
            <label>
              <input
                type="checkbox"
                checked={visible[layer.id]}
                onChange={() => dispatch(toggleLayer(layer.id))}
              />
              <span className="swatch" style={{ background: layer.swatch }} />
              {layer.label}
            </label>
          </li>
        ))}
      </ul>

      <label className="switch">
        <input
          type="checkbox"
          checked={vessels3d}
          onChange={(e) => dispatch(setVessels3d(e.target.checked))}
        />
        <span>
          3D vessels
          <small>Extruded hulls scaled to length &amp; beam, rotated to AIS heading</small>
        </span>
      </label>

      <label className="switch">
        <input
          type="checkbox"
          checked={buildings3d}
          onChange={(e) => dispatch(setBuildings3d(e.target.checked))}
        />
        <span>
          3D buildings
          <small>Extruded footprints from the basemap's vector tiles</small>
        </span>
      </label>

      <label className="switch">
        <input
          type="checkbox"
          checked={mapNames}
          onChange={(e) => dispatch(setMapNames(e.target.checked))}
        />
        <span>
          Street &amp; building names
          <small>Road, place and POI labels; more appear as you zoom in</small>
        </span>
      </label>
    </section>
  )
}
