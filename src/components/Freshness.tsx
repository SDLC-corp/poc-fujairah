import { formatAgo, formatDateTime } from '../utils/format'

/**
 * How old the figures in this block are, and where they came from.
 *
 * One line per block rather than one for the page, because the blocks are not
 * the same age: a position report is minutes old, a filed voyage declaration is
 * hours or days, and a registry particular is older still. Showing a single
 * "last updated" for the page would make the oldest of them look as fresh as
 * the newest.
 *
 * The exact timestamp is on the tooltip — the relative figure is what gets read.
 */
export default function Freshness({
  at,
  source,
  /** Beyond this many minutes the line marks itself as stale. */
  staleAfterMin,
}: {
  at?: string | null
  source: string
  staleAfterMin?: number
}) {
  const ms = at ? Date.parse(at) : NaN
  const mins = Number.isNaN(ms) ? null : Math.round((Date.now() - ms) / 60_000)
  const stale = staleAfterMin != null && mins != null && mins > staleAfterMin

  return (
    <p
      className={`freshness${stale ? ' is-stale' : ''}`}
      title={at ? formatDateTime(at) : 'No timestamp on this record'}
    >
      <span className="freshness-dot" aria-hidden="true" />
      <span className="freshness-source">{source}</span>
      <span className="freshness-age">{formatAgo(at)}</span>
    </p>
  )
}
