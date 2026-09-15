import { useAppDispatch } from '../app/hooks'
import { focusOn } from '../features/view/viewSlice'

/**
 * Where the camera is pointed.
 *
 * It used to carry tilt and rotation sliders as well, because MapLibre only
 * tilts on right-click or ctrl-drag and nobody discovers that. Both are gone
 * now that the chart is locked in plan and north-up — a slider that cannot move
 * the map is worse than no slider. What is left is the pair of extents worth
 * jumping between: the quay and the anchorage are ~20 km apart.
 */
export default function ViewPanel() {
  const dispatch = useAppDispatch()

  return (
    <section className="panel">
      <h2>Camera</h2>
      <div className="export-row" style={{ marginTop: 0 }}>
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
      <p className="muted hint">
        The chart is drawn in plan and north-up, and does not tilt or turn — bearings read off it
        directly, the way they do off a paper sheet.
      </p>
    </section>
  )
}
