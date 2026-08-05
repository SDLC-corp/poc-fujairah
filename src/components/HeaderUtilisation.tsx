import { useAppSelector } from '../app/hooks'
import { selectAreaCapacity } from '../features/analysis/selectors'
import { utilisationLoad } from '../utils/occupancyLoad'

/**
 * Compact anchorage-utilisation meter in the app header. Same figure as the
 * dashboard panel, but visible from every tab so port load is never more than
 * a glance away.
 */
export default function HeaderUtilisation() {
  const capacity = useAppSelector(selectAreaCapacity)

  const totalSpots = capacity.reduce((sum, r) => sum + r.capacity, 0)
  // Nothing meaningful to show until the port data has loaded.
  if (!totalSpots) return null

  const occupied = capacity.reduce((sum, r) => sum + r.occupied, 0)
  const utilisation = Math.round((occupied / totalSpots) * 100)
  const load = utilisationLoad(utilisation)

  return (
    <div
      className={`head-meter ${load.className}`}
      title={`Anchorage utilisation — ${occupied} of ${totalSpots} spots occupied (${load.label})`}
    >
      <span className="head-meter-label">Anchorage utilisation</span>
      <span className="head-meter-track">
        <span className="head-meter-fill" style={{ width: `${utilisation}%` }} />
      </span>
      <strong className="head-meter-value">{utilisation}%</strong>
      <span className="head-meter-state">{load.label}</span>
    </div>
  )
}
