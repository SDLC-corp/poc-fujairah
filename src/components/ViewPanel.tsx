import { useAppDispatch, useAppSelector } from '../app/hooks'
import { focusOn, resetNorth, setBearing, setPitch } from '../features/view/viewSlice'
import { MAX_PITCH } from '../map/basemaps'

/**
 * Explicit camera controls. MapLibre only rotates and tilts on right-click or
 * ctrl-drag, which nobody discovers, so the same thing is exposed as sliders.
 */
export default function ViewPanel() {
  const dispatch = useAppDispatch()
  const pitch = useAppSelector((s) => s.view.pitch)
  const bearing = useAppSelector((s) => s.view.bearing)

  return (
    <section className="panel">
      <h2>Camera</h2>

      <div className="export-row" style={{ marginTop: 0, marginBottom: 12 }}>
        <button type="button" className="ghost-button" onClick={() => dispatch(focusOn('port'))}>
          Port
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => dispatch(focusOn('anchorage'))}
        >
          Anchorage area
        </button>
      </div>

      <label className="slider">
        <span>
          Tilt <strong>{pitch.toFixed(0)}°</strong>
        </span>
        <input
          type="range"
          min={0}
          max={MAX_PITCH}
          step={1}
          value={pitch}
          onChange={(e) => dispatch(setPitch(Number(e.target.value)))}
        />
      </label>

      <label className="slider">
        <span>
          Rotation <strong>{Math.round(bearing)}°</strong>
        </span>
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={bearing}
          onChange={(e) => dispatch(setBearing(Number(e.target.value)))}
        />
      </label>

      <button type="button" className="ghost-button" onClick={() => dispatch(resetNorth())}>
        Reset to north
      </button>
      <p className="muted hint">On the map: right-click or ctrl + drag to rotate and tilt.</p>
    </section>
  )
}
