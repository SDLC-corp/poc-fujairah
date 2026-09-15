import type { ReactNode } from 'react'
import { FiChevronDown } from 'react-icons/fi'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { togglePanel } from '../features/ui/uiSlice'

/**
 * A dashboard panel that can be folded away.
 *
 * Only while the map is expanded. At rest the dashboard is a scrolling page and
 * a panel that folds saves nothing — the next one simply moves up. Expanded,
 * the panels are floating over the chart in a fixed column, and every one that
 * is open is water the operator cannot see; folding the three they are not
 * watching is the difference between a strip of chart and most of one.
 *
 * So the heading becomes a button only in that state. Everywhere else it stays
 * an ordinary heading, with no chevron to suggest an interaction that would do
 * nothing useful.
 */
export default function CollapsiblePanel({
  id,
  title,
  badge,
  children,
  className,
}: {
  /** Stable key for the collapsed set — must outlive the render. */
  id: string
  title: ReactNode
  /** Rendered beside the title, and kept visible while folded. */
  badge?: ReactNode
  children: ReactNode
  className?: string
}) {
  const dispatch = useAppDispatch()
  const collapsible = useAppSelector((s) => s.ui.mapFullscreen)
  const collapsed = useAppSelector((s) => s.ui.collapsedPanels.includes(id))
  const open = !collapsible || !collapsed

  if (!collapsible) {
    return (
      <section className={`panel${className ? ` ${className}` : ''}`}>
        <h2>
          {title}
          {badge}
        </h2>
        {children}
      </section>
    )
  }

  return (
    <section
      className={`panel panel-collapsible${open ? '' : ' is-collapsed'}${
        className ? ` ${className}` : ''
      }`}
    >
      <h2>
        <button
          type="button"
          className="panel-disclosure"
          aria-expanded={open}
          onClick={() => dispatch(togglePanel(id))}
        >
          <FiChevronDown className="panel-chevron" size={15} aria-hidden="true" />
          <span className="panel-disclosure-title">{title}</span>
          {/* Stays on the header rather than in the body: a folded alert panel
              still has to be able to say there are three alerts. */}
          {badge}
        </button>
      </h2>
      {open && <div className="panel-body">{children}</div>}
    </section>
  )
}
