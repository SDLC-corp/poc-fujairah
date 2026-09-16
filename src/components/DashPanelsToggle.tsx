import { FiMenu, FiX } from 'react-icons/fi'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { toggleDashPanels } from '../features/ui/uiSlice'

/**
 * Calls up the dashboard's statistics over the expanded chart.
 *
 * A round control in the corner rather than a permanent column, because full
 * screen is asked for when the chart is the thing being read — utilisation, the
 * alert feed and what is arriving are worth a glance, not a standing quarter of
 * the window. It sits above the column it opens rather than beside it, so the
 * same corner means the same thing whether the figures are showing or not, and
 * the way back out is where the way in was.
 *
 * Only mounted while the map is expanded; at rest the statistics are simply
 * part of the page.
 */
export default function DashPanelsToggle() {
  const dispatch = useAppDispatch()
  const open = useAppSelector((s) => s.ui.dashPanelsOpen)

  return (
    <button
      type="button"
      className={`dash-panels-toggle${open ? ' is-on' : ''}`}
      aria-expanded={open}
      aria-label={open ? 'Hide statistics' : 'Show statistics'}
      title={open ? 'Hide statistics' : 'Show statistics'}
      onClick={() => dispatch(toggleDashPanels())}
    >
      {open ? <FiX size={17} /> : <FiMenu size={17} />}
    </button>
  )
}
