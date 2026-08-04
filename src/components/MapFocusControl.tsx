import { useAppDispatch } from '../app/hooks'
import { focusOn } from '../features/view/viewSlice'

/**
 * Extent presets, on the map itself. The port quay and the Fujairah Anchorage
 * Area are ~20 km apart, so jumping between them by hand is tedious.
 */
export default function MapFocusControl() {
  const dispatch = useAppDispatch()
  return (
    <div className="map-focus">
      <button type="button" onClick={() => dispatch(focusOn('port'))}>
        Port
      </button>
      <button type="button" onClick={() => dispatch(focusOn('anchorage'))}>
        Anchorage area
      </button>
    </div>
  )
}
