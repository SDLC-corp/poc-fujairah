import { useEffect, useReducer } from 'react'
import { formatAgo, formatDateTime } from '../utils/format'

/**
 * How old the vessel's last position report is, beside her area.
 *
 * Age belongs next to the thing it qualifies. "Anchored, Area A" reads as a
 * fact about now, and it is only a fact about now if the fix behind it is
 * minutes old — a vessel at anchor reports every three minutes under
 * ITU-R M.1371, so ten is already worth flagging and an hour means the console
 * is describing where she used to be.
 *
 * It re-renders itself on a timer rather than waiting for something else to
 * change, because "1 min ago" is the one label on the page that becomes a lie
 * simply by being left alone.
 */
export default function UpdatedChip({
  at,
  /** Past this many minutes the chip marks itself. */
  staleAfterMin = 10,
}: {
  at?: string | null
  staleAfterMin?: number
}) {
  const [, tick] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    // Half a minute: fine enough that the figure is never more than 30 s out,
    // coarse enough to cost nothing.
    const timer = window.setInterval(tick, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const ms = at ? Date.parse(at) : NaN
  const mins = Number.isNaN(ms) ? null : Math.round((Date.now() - ms) / 60_000)
  const stale = mins != null && mins > staleAfterMin

  return (
    <span
      className={`updated-chip${stale ? ' is-stale' : ''}`}
      title={
        at
          ? `Last position report ${formatDateTime(at)}`
          : 'No time recorded against this position'
      }
    >
      <span className="updated-dot" aria-hidden="true" />
      updated {formatAgo(at)}
    </span>
  )
}
