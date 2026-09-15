import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  raiseGeofence,
  INCIDENT_JITTER_MS,
  INCIDENT_MIN_DELAY_MS,
} from '../features/incidents/incidentsSlice'
import { selectAllGeofences } from '../features/analysis/selectors'

/**
 * Incidents happen while the console is up rather than arriving with the data.
 * This watches the register of geofences and reports the next unraised one
 * after a randomised delay, which is what puts it on the chart.
 *
 * Headless. It used to raise a toast as well, but the notification slot is now
 * the anchor-drag alarm's — a declared zone is a standing condition read off
 * the chart, whereas a vessel dragging needs someone to do something about it
 * now. See DragAlert.
 */
export default function IncidentWatch() {
  const dispatch = useAppDispatch()
  const register = useAppSelector(selectAllGeofences)
  const raised = useAppSelector((s) => s.incidents.raised)

  const pending = (register?.features ?? []).filter((f) => !raised.includes(f.properties.id))
  // Only the id is a dependency: re-deriving the array on every render would
  // otherwise restart the timer and the incident would never fire.
  const nextId = pending[0]?.properties.id ?? null

  useEffect(() => {
    if (!nextId) return
    const delay = INCIDENT_MIN_DELAY_MS + Math.random() * INCIDENT_JITTER_MS
    const timer = setTimeout(() => dispatch(raiseGeofence(nextId)), delay)
    return () => clearTimeout(timer)
  }, [nextId, dispatch])

  return null
}
