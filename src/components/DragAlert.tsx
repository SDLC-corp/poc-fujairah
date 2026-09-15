import { useEffect, useRef, useState } from 'react'
import { destination } from '@turf/turf'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { selectDraggingVessels, swingRadiusM } from '../features/analysis/selectors'
import { dragVessel } from '../features/portData/portDataSlice'
import { selectFeature } from '../features/selection/selectionSlice'
import { focusVessel } from '../features/view/viewSlice'
import { setTab } from '../features/ui/uiSlice'
import { formatDistance } from '../utils/format'
import Icon from './Icon'

/**
 * Anchor-drag watch.
 *
 * Mounted at the app root, so the alarm follows the operator across screens
 * rather than waiting on the dashboard for someone to come back to it. It holds
 * the console's one notification slot — the declared-zone incidents gave it up,
 * because a zone is a standing condition read off the chart while a ship
 * dragging across the anchorage needs somebody to do something now.
 *
 * The check itself is real — see `selectDraggingVessels`, which compares where
 * a vessel's anchor was let go against where it appears to be now. What this
 * adds is a reason for it ever to fire: the dataset is a still photograph, so
 * nothing in it drags, and an alarm that can never go off is an alarm nobody
 * trusts. So one vessel is walked off her ground tackle a short while after the
 * console comes up — the same device the geofence incidents use, and for the
 * same reason. Replace the timer with the feed and the rest stands.
 */

/**
 * Earliest the drag may start, measured from when the port data landed. Short
 * enough to be found without waiting for it, long enough that the dashboard has
 * drawn first — the banner arriving is itself the thing being demonstrated.
 */
export const DRAG_MIN_DELAY_MS = 10_000
/** Random spread on top, so it does not land on the same beat as the geofence. */
export const DRAG_JITTER_MS = 8_000
/** A shamal sets in from the north-west, so she runs away to the south-east. */
const DRAG_BEARING_DEG = 135

export default function DragAlert() {
  const dispatch = useAppDispatch()
  const vessels = useAppSelector((s) => s.portData.vessels)
  const status = useAppSelector((s) => s.portData.status)
  const swingFactor = useAppSelector((s) => s.analysis.swingFactor)
  const safetyMarginM = useAppSelector((s) => s.analysis.safetyMarginM)
  const dragging = useAppSelector(selectDraggingVessels)

  /**
   * Once a session. Without this, dealing with the drag — releasing her spot
   * clears where she brought up, so she stops dragging — would immediately arm
   * the next vessel, and the anchorage would never settle.
   */
  const firedRef = useRef(false)

  /**
   * Dismissal is per vessel, not global: closing the toast puts away *this*
   * alarm, and a second ship dragging raises it again rather than being
   * swallowed by a box the operator shut ten minutes ago.
   */
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  /**
   * Pick a candidate once the data is in and nothing is dragging yet. Keyed on
   * the id alone — depending on the vessel array would restart the timer on
   * every unrelated change to the fleet, and the drag would never happen.
   */
  const candidateId =
    status === 'ready' && dragging.length === 0 && !firedRef.current
      ? (vessels?.features.find(
          (v) => v.properties.status === 'anchored' && v.properties.anchoredAt,
        )?.properties.id ?? null)
      : null

  useEffect(() => {
    if (!candidateId) return
    const timer = setTimeout(
      () => {
        const vessel = vessels?.features.find((v) => v.properties.id === candidateId)
        if (!vessel) return
        const p = vessel.properties
        // Far enough out of the circle to be unambiguous, not so far that she
        // has crossed the anchorage.
        const runM = swingRadiusM(p.lengthM, swingFactor, safetyMarginM) * 1.4
        const to = destination(vessel.geometry.coordinates, runM / 1000, DRAG_BEARING_DEG, {
          units: 'kilometers',
        }).geometry.coordinates as [number, number]
        firedRef.current = true
        dispatch(dragVessel({ vesselId: candidateId, coordinates: to }))
      },
      DRAG_MIN_DELAY_MS + Math.random() * DRAG_JITTER_MS,
    )
    return () => clearTimeout(timer)
    // `vessels` is read at fire time rather than depended on, for the reason above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, dispatch, swingFactor, safetyMarginM])

  if (dragging.length === 0) return null

  const worst = dragging[0]
  const p = worst.vessel.properties
  if (p.id === dismissedId) return null

  /** Put it on the chart: the map lives on the dashboard, so go there first. */
  function show() {
    dispatch(setTab('dashboard'))
    dispatch(selectFeature({ layer: 'vessels', id: p.id }))
    dispatch(focusVessel(p.id))
  }

  return (
    <div className="incident-alert incident-high" role="alert" aria-live="assertive">
      <span className="incident-icon">
        <Icon name="alert" size={18} />
      </span>

      <div className="incident-body">
        <span className="incident-tag">
          Anchor dragging
          {dragging.length > 1 && ` · ${dragging.length} vessels`}
          {p.area ? ` · Area ${p.area}` : ''}
        </span>
        <strong>{p.name}</strong>
        <span className="muted">
          Anchor has run {formatDistance(worst.driftM)} from where it was let go.
        </span>
        <span className="muted">Outside her {worst.radiusM} m swing circle.</span>
        {dragging.length > 1 && (
          <span className="muted">
            Also: {dragging.slice(1).map((d) => d.vessel.properties.name).join(', ')}
          </span>
        )}
      </div>

      <div className="incident-actions">
        <button type="button" className="incident-show" onClick={show}>
          Show on map
        </button>
        <button
          type="button"
          className="incident-dismiss"
          aria-label="Dismiss"
          onClick={() => setDismissedId(p.id)}
        >
          ×
        </button>
      </div>
    </div>
  )
}
