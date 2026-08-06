import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  acknowledgeIncident,
  raiseGeofence,
  INCIDENT_JITTER_MS,
  INCIDENT_MIN_DELAY_MS,
} from '../features/incidents/incidentsSlice'
import { selectAllGeofences } from '../features/analysis/selectors'
import { selectFeature } from '../features/selection/selectionSlice'
import { focusFeature } from '../features/view/viewSlice'
import { setTab } from '../features/ui/uiSlice'
import Icon from './Icon'

/**
 * Incidents happen while the console is up rather than arriving with the data.
 * This watches the register of geofences, reports the next unraised one after a
 * randomised delay, and announces it until the operator acknowledges. Mounted
 * once at the app root so the alert follows the operator across screens.
 */
export default function IncidentAlert() {
  const dispatch = useAppDispatch()
  const register = useAppSelector(selectAllGeofences)
  const raised = useAppSelector((s) => s.incidents.raised)
  const announced = useAppSelector((s) => s.incidents.announced)

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

  const fence = register?.features.find((f) => f.properties.id === announced)
  if (!fence) return null

  const p = fence.properties
  const exclusion = p.kind === 'exclusion'

  /** Put it on screen: the map lives on the dashboard, so go there first. */
  function show() {
    dispatch(setTab('dashboard'))
    dispatch(selectFeature({ layer: 'geofences', id: p.id }))
    dispatch(focusFeature({ target: 'geofence', id: p.id }))
    dispatch(acknowledgeIncident())
  }

  return (
    <div
      className={`incident-alert${exclusion ? ' incident-high' : ''}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="incident-icon">
        <Icon name="alert" size={18} />
      </span>

      <div className="incident-body">
        <span className="incident-tag">
          {exclusion ? 'Exclusion zone declared' : 'Advisory zone declared'} · Area {p.area}
        </span>
        <strong>{p.name}</strong>
        <span className="muted">{p.cause}</span>
        <span className="muted">{p.rule}</span>
      </div>

      <div className="incident-actions">
        <button type="button" className="incident-show" onClick={show}>
          Show on map
        </button>
        <button
          type="button"
          className="incident-dismiss"
          aria-label="Dismiss"
          onClick={() => dispatch(acknowledgeIncident())}
        >
          ×
        </button>
      </div>
    </div>
  )
}
