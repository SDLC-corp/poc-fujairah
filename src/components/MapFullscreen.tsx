import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { setMapFullscreen, toggleMapFullscreen } from '../features/ui/uiSlice'
import { FiMaximize2, FiX } from 'react-icons/fi'

/**
 * Expands the map pane over the rest of the screen.
 *
 * In-app rather than the browser's Fullscreen API: the header stays put, so the
 * operator does not lose the title bar and sign-out, and there is no permission
 * prompt or OS-level transition between a glance at the chart and a glance back
 * at the panels. It also means the pane keeps its own controls — the extent
 * presets, the legend and the details card come with it.
 *
 * Nothing here resizes MapLibre: the map watches its container with a
 * ResizeObserver (see MapView), so the CSS change is enough.
 */
export default function MapFullscreen() {
  const dispatch = useAppDispatch()
  const on = useAppSelector((s) => s.ui.mapFullscreen)

  /* Esc is the way out of anything that covers the screen. */
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch(setMapFullscreen(false))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on, dispatch])

  /*
   * Leaving the screen collapses it — but that is `setTab`'s job, not this
   * component's. Unmounting cannot tell "the operator left" from "the screen
   * rearranged itself", and the register does rearrange itself the moment this
   * button is pressed: the cleanup fired on the button that had just set the
   * flag and cleared it again, so full screen never took.
   */

  return (
    <button
      type="button"
      className={`map-fs-btn${on ? ' is-on' : ''}`}
      onClick={() => dispatch(toggleMapFullscreen())}
      title={on ? 'Exit full screen (Esc)' : 'Full screen'}
      aria-label={on ? 'Exit full screen' : 'Full screen'}
      aria-pressed={on}
    >
      {on ? (
        <>
          <FiX size={15} />
          <span>Exit full screen</span>
          <kbd>Esc</kbd>
        </>
      ) : (
        <FiMaximize2 size={15} />
      )}
    </button>
  )
}
