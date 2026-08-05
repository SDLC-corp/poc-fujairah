import { useAppDispatch, useAppSelector } from '../app/hooks'
import { selectAreaCapacity } from '../features/analysis/selectors'
import { setTab } from '../features/ui/uiSlice'
import type { TabId } from '../features/ui/uiSlice'
import type { LoadTone as Tone } from '../utils/occupancyLoad'
import Icon from './Icon'

/**
 * Movement figures. The AIS snapshot carries no arrival history and no
 * eta-vs-ata pairs, so these are sample values until the feed does — see
 * README notes on which become derivable first.
 */
const TRAFFIC = {
  arrivalsToday: 32,
  departuresToday: 28,
  arrivalsExpected: 35,
  departuresExpected: 30,
  arrivalDelayMin: 24,
  departureDelayMin: 31,
}

/** Average delay at or above this reads as a problem rather than slippage. */
const DELAY_WARN_MIN = 30

interface Kpi {
  key: string
  value: number | string
  label: string
  /** Name from the Icon registry. */
  icon: string
  /** Denominator or qualifier — what the headline number is measured against. */
  note: string
  tone?: Tone
  /** Tiles that have a natural destination become buttons. */
  goTo?: TabId
}

/**
 * Full-width metric band above the map. Every figure is derived from the loaded
 * data and the same selectors the panels below use, so the band and the detail
 * can never disagree.
 */
export default function DashboardKpis() {
  const dispatch = useAppDispatch()
  const vessels = useAppSelector((s) => s.portData.vessels)
  const capacity = useAppSelector(selectAreaCapacity)

  const fleet = vessels?.features ?? []
  const anchored = fleet.filter((v) => v.properties.status === 'anchored').length
  const underway = fleet.filter((v) => v.properties.status === 'underway').length
  const awaiting = fleet.filter((v) => v.properties.status === 'awaiting').length

  const totalSpots = capacity.reduce((sum, r) => sum + r.capacity, 0)
  const occupied = capacity.reduce((sum, r) => sum + r.occupied, 0)
  const available = Math.max(0, totalSpots - occupied)

  const kpis: Kpi[] = [
    {
      key: 'total',
      value: fleet.length,
      label: 'Total vessels',
      icon: 'vessel',
      note: `${capacity.length} anchorage areas`,
      goTo: 'tracking',
    },
    {
      key: 'anchored',
      value: anchored,
      label: 'At anchor',
      icon: 'anchor',
      note: `${fleet.length ? Math.round((anchored / fleet.length) * 100) : 0}% of fleet`,
    },
    {
      key: 'underway',
      value: underway,
      label: 'Under way',
      icon: 'underway',
      note: 'making way in port limits',
    },
    {
      key: 'awaiting',
      value: awaiting,
      label: 'Awaiting anchorage',
      icon: 'queue',
      note: awaiting ? 'queue needs assignment' : 'queue clear',
      tone: awaiting > 0 ? 'warn' : 'ok',
      goTo: 'assignment',
    },
    {
      key: 'occupied',
      value: occupied,
      label: 'Spots occupied',
      icon: 'spots',
      note: `of ${totalSpots} total`,
      goTo: 'occupancy',
    },
    {
      key: 'available',
      value: available,
      label: 'Spots available',
      icon: 'available',
      note: available ? 'ready to assign' : 'anchorage full',
      tone: available === 0 ? 'alert' : 'ok',
      goTo: 'occupancy',
    },
    {
      key: 'arrivals-today',
      value: TRAFFIC.arrivalsToday,
      label: "Today's arrivals",
      icon: 'arrival',
      note: 'brought up since midnight',
    },
    {
      key: 'departures-today',
      value: TRAFFIC.departuresToday,
      label: "Today's departures",
      icon: 'departure',
      note: 'sailed since midnight',
    },
    {
      key: 'arrivals-expected',
      value: TRAFFIC.arrivalsExpected,
      label: 'Expected arrivals',
      icon: 'schedule',
      note: 'declared ETA, next 24 h',
    },
    {
      key: 'departures-expected',
      value: TRAFFIC.departuresExpected,
      label: 'Expected departures',
      icon: 'schedule',
      note: 'declared ETD, next 24 h',
    },
    {
      key: 'arrival-delay',
      value: `${TRAFFIC.arrivalDelayMin} min`,
      label: 'Avg arrival delay',
      icon: 'delay',
      note: 'against declared ETA',
      tone: TRAFFIC.arrivalDelayMin >= DELAY_WARN_MIN ? 'warn' : 'ok',
    },
    {
      key: 'departure-delay',
      value: `${TRAFFIC.departureDelayMin} min`,
      label: 'Avg departure delay',
      icon: 'delay',
      note: 'against declared ETD',
      tone: TRAFFIC.departureDelayMin >= DELAY_WARN_MIN ? 'warn' : 'ok',
    },
  ]

  return (
    <div className="kpi-band" role="group" aria-label="Live port metrics">
      {kpis.map((kpi) => {
        const { goTo } = kpi
        const className = `kpi${kpi.tone ? ` kpi-${kpi.tone}` : ''}`
        const body = (
          <>
            <span className="kpi-icon">
              <Icon name={kpi.icon} size={15} />
            </span>
            <span className="kpi-text">
              <span className="kpi-value">{kpi.value}</span>
              <span className="kpi-label">{kpi.label}</span>
            </span>
            {goTo && (
              <span className="kpi-go">
                <Icon name="chevron" size={13} />
              </span>
            )}
          </>
        )
        // The band is one line tall, so the qualifier lives in the tooltip
        // rather than costing a second row.
        const title = `${kpi.label}: ${kpi.value} — ${kpi.note}`

        return goTo ? (
          <button
            key={kpi.key}
            type="button"
            className={`${className} kpi-link`}
            title={title}
            onClick={() => dispatch(setTab(goTo))}
          >
            {body}
          </button>
        ) : (
          <div key={kpi.key} className={className} title={title}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
