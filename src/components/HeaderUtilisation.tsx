import { useAppSelector } from '../app/hooks'
import { selectPortTotals } from '../features/analysis/selectors'
import { utilisationLoad } from '../utils/occupancyLoad'

/**
 * Compact anchorage-utilisation meter in the app header. Same figure as the
 * dashboard panel, but visible from every tab so port load is never more than
 * a glance away.
 */
export default function HeaderUtilisation() {
  const { capacity: totalSpots, occupied, utilisationPct } = useAppSelector(selectPortTotals)

  // Nothing meaningful to show until the port data has loaded.
  if (!totalSpots) return null

  const load = utilisationLoad(utilisationPct)

  return (
    <div
      className={`head-meter ${load.className}`}
      title={`Anchorage utilisation — ${occupied} of ${totalSpots} spots occupied (${load.label})`}
    >
      <span className="head-meter-label">Anchorage utilisation</span>
      <span className="head-meter-track">
        <span className="head-meter-fill" style={{ width: `${utilisationPct}%` }} />
      </span>
      <strong className="head-meter-value">{utilisationPct}%</strong>
      <span className="head-meter-state">{load.label}</span>
    </div>
  )
}
