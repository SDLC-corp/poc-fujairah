import { distance } from '@turf/turf'
import { useAppSelector } from '../app/hooks'
import { anchorPosition, DRAG_TOLERANCE_M, selectCableM } from '../features/analysis/selectors'
import { formatLatLonBoth, formatLatLonParts } from '../utils/format'
import CopyButton from './CopyButton'

/**
 * Where she was put, and where she is.
 *
 * Two different facts that a single "position" row cannot tell apart. The given
 * position is the spot she was ordered to and brought up on; the actual position
 * is where the last fix puts her. A vessel at anchor rides round her ground
 * tackle, so the two are *expected* to differ — which is exactly why both have
 * to be shown rather than one standing in for the other.
 *
 * The verdict underneath is not the gap between those two points, though: that
 * gap is mostly swing. It is the gap between where the anchor was let go and
 * where the anchor must be now, worked from each position and heading in turn —
 * the same comparison the drag alarm makes, so nothing that shows this block can
 * disagree with the alarm.
 *
 * It lives here rather than in either screen because both the map card and the
 * vessel record show it, and two copies of this arithmetic would eventually
 * give two answers.
 */

/** GeoJSON order in, both readable forms out. */
const posLines = (c: number[]) => formatLatLonBoth(c[1], c[0])

/**
 * One of the two positions, as one latitude and one longitude, each named.
 *
 * Only the bridge form is shown. This used to print the same position again
 * underneath in decimal degrees, which is the form another system wants pasted
 * into it rather than the form anyone reads — so it went to the clipboard, where
 * it is useful, and came off the face, where it only doubled the number of lines
 * to look through to find the one figure being checked.
 *
 * The label sits on its own line with the copy button at the far end of it, so
 * neither steals width from the coordinates underneath — in a 306px card the
 * figures need every pixel of the row to themselves.
 */
function AnchorRow({ label, hint, at }: { label: string; hint: string; at: number[] }) {
  const [lat, lon] = formatLatLonParts(at[1], at[0])
  return (
    <div>
      <dt title={hint}>
        <span>{label}</span>
        <CopyButton label={`the ${label.toLowerCase()} position`} value={posLines(at)} />
      </dt>
      <dd>
        <span className="pos-dmm">
          <span className="pos-axis">Latitude</span>
          <span>{lat}</span>
          <span className="pos-axis">Longitude</span>
          <span>{lon}</span>
        </span>
      </dd>
    </div>
  )
}

export default function AnchorPosition({
  /** Named in the copied block, so a paste says which ship it is about. */
  name,
  anchoredAt,
  nowAt,
  headingDeg,
  anchoredHeadingDeg,
}: {
  name: string
  anchoredAt: [number, number]
  nowAt: number[]
  headingDeg: number
  anchoredHeadingDeg?: number | null
}) {
  const cableM = useAppSelector(selectCableM)

  const anchorRun =
    distance(
      anchorPosition(anchoredAt, anchoredHeadingDeg ?? headingDeg, cableM),
      anchorPosition(nowAt, headingDeg, cableM),
      { units: 'kilometers' },
    ) * 1000
  const dragging = anchorRun > DRAG_TOLERANCE_M

  return (
    <div className={`anchor-box${dragging ? ' is-dragging' : ''}`}>
      <div className="swing-head">
        <span>Anchor position</span>
        <span className="anchor-head-right">
          <strong className={`anchor-verdict${dragging ? ' is-alert' : ''}`}>
            <span className="anchor-verdict-dot" aria-hidden="true" />
            {dragging ? `dragged ${Math.round(anchorRun)} m` : 'holding'}
          </strong>
          {/* The whole block, for pasting into a log, a handover note or a
              message to the bridge — which is what these figures are for. */}
          <CopyButton
            label="both positions"
            value={[
              `${name} — anchor position`,
              `Given   ${posLines(anchoredAt)}`,
              `Actual  ${posLines(nowAt)}`,
              dragging
                ? `Anchor has run ${Math.round(anchorRun)} m from where it was let go.`
                : 'Holding — the difference is swing, not drag.',
            ].join('\n')}
          />
        </span>
      </div>

      <dl className="anchor-kv">
        <AnchorRow
          label="Given"
          hint="The spot she was given, and where she brought up."
          at={anchoredAt}
        />
        <AnchorRow label="Actual" hint="Where the last position report puts her." at={nowAt} />
      </dl>

      <p className="muted anchor-note">
        {dragging
          ? 'Her anchor is no longer where it was let go — she is running.'
          : 'She is riding to her cable; the difference above is swing, not drag.'}
      </p>
    </div>
  )
}
