import { FiChevronsDown, FiChevronsUp } from 'react-icons/fi'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { setCollapsedPanels } from '../features/ui/uiSlice'

/**
 * Folds the whole floating column away, or opens it again.
 *
 * Four panels folded one at a time is four clicks to see the chart and four
 * more to get the figures back, which is enough friction that an operator
 * simply leaves them open and works around them. One control does it in one.
 *
 * It only exists while the map is expanded, for the same reason the panels only
 * fold there: on the scrolling dashboard nothing is in the way.
 */
export default function PanelFolds({ ids }: { ids: string[] }) {
  const dispatch = useAppDispatch()
  const expanded = useAppSelector((s) => s.ui.mapFullscreen)
  const collapsed = useAppSelector((s) => s.ui.collapsedPanels)

  if (!expanded) return null

  const open = ids.filter((id) => !collapsed.includes(id))
  const allShut = open.length === 0

  return (
    <div className="panel-folds">
      <span className="muted">
        {allShut ? 'All panels folded' : `${open.length} of ${ids.length} open`}
      </span>
      <button
        type="button"
        className="link-cell panel-folds-action"
        onClick={() =>
          // Only these ids are touched — another screen's folded panels are not
          // this control's business to reopen.
          dispatch(
            setCollapsedPanels(
              allShut
                ? collapsed.filter((id) => !ids.includes(id))
                : [...new Set([...collapsed, ...ids])],
            ),
          )
        }
      >
        {allShut ? <FiChevronsDown size={13} /> : <FiChevronsUp size={13} />}
        {allShut ? 'Expand all' : 'Collapse all'}
      </button>
    </div>
  )
}
