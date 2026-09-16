import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  selectGeofences,
  selectNearestBerthByVessel,
  selectVesselAreaIndex,
  swingRadiusM,
} from '../features/analysis/selectors'
import { SAFETY_MARGIN_NM } from '../features/analysis/analysisSlice'
import { selectAllowedTabs } from '../features/roles/selectors'
import { setTab } from '../features/ui/uiSlice'
import { VESSEL_LABELS } from '../map/vesselTypes'
import type { VesselType } from '../types/gis'
import { clearSelection } from '../features/selection/selectionSlice'
import { formatDateTime, formatDistance, titleCase } from '../utils/format'
import AnchorPosition from './AnchorPosition'
import UpdatedChip from './UpdatedChip'
import type { LayerId } from '../types/gis'

/**
 * Properties carrying an ISO timestamp.
 *
 * The card renders whatever the feature holds, so without this every one of
 * these came out as the raw `2026-08-03T09:15:00Z` while every other figure on
 * the card was formatted — and ETA, ATA and ETD sat in a column looking like
 * three different kinds of thing when they are the same kind of thing.
 */
const DATE_KEYS = new Set([
  'eta',
  'etd',
  'ata',
  'atd',
  'etaUpdatedAt',
  'positionAt',
  'submittedAt',
  'createdAt',
])

/**
 * Shown in their own block, or not worth a row on a card this size.
 *
 * `positionAt` is here because it is now the chip under the title. A row saying
 * "Position at 03 Aug 14:20" is the same fact as "updated 1 min ago" and the
 * worse half of it: the age is what decides whether the rest of the card is
 * describing now, and nobody works that out from a timestamp at a glance.
 */
const SKIP_KEYS = new Set(['request', 'anchoredAt', 'anchoredHeadingDeg', 'positionAt'])

/** Where the generated label reads badly or says less than it could. */
const LABEL: Record<string, string> = {
  imo: 'IMO',
  eta: 'ETA',
  etd: 'ETD',
  ata: 'ATA',
  atd: 'ATD',
  etaUpdatedAt: 'ETA revised',
  positionAt: 'Position at',
  lengthM: 'LOA',
  beamM: 'Beam',
  draftM: 'Draft',
  speedKn: 'Speed',
  headingDeg: 'Heading',
}

const UNIT: Record<string, string> = {
  lengthM: ' m',
  beamM: ' m',
  draftM: ' m',
  speedKn: ' kn',
  headingDeg: '°',
}

const LAYER_TITLE: Record<LayerId, string> = {
  vessels: 'Vessel',
  anchorages: 'Anchorage area',
  contours: 'Depth contour',
  soundings: 'Spot sounding',
  graticule: 'Graticule',
  compass: 'Compass rose',
  swing: 'Swing circle',
  freeSpots: 'Available spot',
  geofences: 'Geofence',
}

/** One property row's value, rendered as the kind of thing it actually is. */
function renderValue(key: string, value: unknown): string {
  if (value == null || value === '') return '—'
  if (DATE_KEYS.has(key)) return formatDateTime(String(value))
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return `${value}${UNIT[key] ?? ''}`
  return String(value)
}

const labelFor = (key: string) =>
  LABEL[key] ?? titleCase(key.replace(/([A-Z])/g, ' $1').trim())

/** Floating card describing whatever is currently selected on the map. */
export default function FeatureDetails() {
  const dispatch = useAppDispatch()
  const selected = useAppSelector((s) => s.selection.selected)
  const cardOpen = useAppSelector((s) => s.selection.cardOpen)
  const vessels = useAppSelector((s) => s.portData.vessels)
  const anchorages = useAppSelector((s) => s.portData.anchorages)
  const geofences = useAppSelector(selectGeofences)
  const areaIndex = useAppSelector(selectVesselAreaIndex)
  const nearest = useAppSelector(selectNearestBerthByVessel)
  const swingFactor = useAppSelector((s) => s.analysis.swingFactor)
  const safetyMarginM = useAppSelector((s) => s.analysis.safetyMarginM)
  const transit = useAppSelector((s) => s.transit.active)
  const allowedTabs = useAppSelector(selectAllowedTabs)

  // The card is opened by a click and closed by changing screen, so a selection
  // that came with the operator from another tab draws nothing until they click
  // something here.
  if (!selected || !cardOpen) return null
  // A move owns the map while it runs. The card would be describing a vessel
  // at a position it is in the act of leaving, over the passage the operator
  // ordered and is watching — so it stands down and comes back on arrival, the
  // selection itself untouched.
  if (transit) return null

  const collection = {
    anchorages,
    vessels,
    swing: vessels,
    freeSpots: null,
    geofences,
    contours: null,
    soundings: null,
    graticule: null,
    compass: null,
  }[selected.layer]
  const feature = collection?.features.find((f) => f.properties.id === selected.id)
  if (!feature) return null

  const props = feature.properties as Record<string, unknown>
  const rows: [string, unknown][] = Object.entries(props).filter(
    ([key]) => key !== 'id' && key !== 'name' && !SKIP_KEYS.has(key),
  )

  // A vessel always shows all four times, present or not. The feed simply
  // omits the ones it has nothing for, so without this a ship with no ETA
  // filed has no ETA row at all — and "the row is missing" and "the row says
  // nothing" are read very differently by someone checking a schedule.
  if (selected.layer === 'vessels') {
    for (const key of ['eta', 'ata', 'etd', 'atd']) {
      if (!(key in props)) rows.push([key, null])
    }
  }

  // Where she was put, and where she is — see AnchorPosition, which both this
  // card and the vessel record render, so the two can never disagree.
  const anchoredAt = props.anchoredAt as [number, number] | null | undefined
  const nowAt = feature.geometry.type === 'Point' ? (feature.geometry.coordinates as number[]) : null

  const containment =
    selected.layer === 'vessels'
      ? (areaIndex.find((entry) => entry.vessel.properties.id === selected.id)?.areas ?? [])
      : []
  const nearestBerth = selected.layer === 'vessels' ? nearest[selected.id] : undefined

  const loa = typeof props.lengthM === 'number' ? props.lengthM : null
  const swingR = loa == null ? null : swingRadiusM(loa, swingFactor, safetyMarginM)
  const swingAreaM2 = swingR == null ? null : Math.PI * swingR * swingR

  return (
    <aside className="details-card">
      <header>
        <div className="details-title">
          <span className="details-kind">{LAYER_TITLE[selected.layer]}</span>
          <h3>{String(props.name ?? selected.id)}</h3>
        </div>

        {/* The full record lives on its own screen, which reads the same
            selection this card does — so opening it is just a change of tab.
            Hidden when the role cannot reach that screen, on the same rule as
            the nav rail: what a role cannot open is not offered. */}
        {selected.layer === 'vessels' && allowedTabs.has('vessel') && (
          <button
            type="button"
            className="details-full"
            title="Show full details"
            aria-label="Show full details"
            onClick={() => dispatch(setTab('vessel'))}
          >
            Full details
          </button>
        )}

        <button
          type="button"
          className="close"
          aria-label="Close"
          onClick={() => dispatch(clearSelection())}
        >
          ×
        </button>
      </header>

      {/* How old everything below it is.
          Under the header rather than in it: the header is dark chrome in every
          theme and this chip is painted from the surface tokens, and the age
          qualifies the figures rather than the title. First thing under it,
          because a position, an area and a speed are all claims about *now* and
          are only true if the fix behind them is minutes old. */}
      {selected.layer === 'vessels' && (
        <p className="details-updated">
          <UpdatedChip at={props.positionAt as string | null | undefined} />
        </p>
      )}

      <dl>
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{labelFor(key)}</dt>
            <dd>{renderValue(key, value)}</dd>
          </div>
        ))}
      </dl>

      {selected.layer === 'vessels' && anchoredAt && nowAt && (
        <AnchorPosition
          name={String(props.name ?? selected.id)}
          anchoredAt={anchoredAt}
          nowAt={nowAt}
          headingDeg={props.headingDeg as number}
          anchoredHeadingDeg={props.anchoredHeadingDeg as number | null | undefined}
        />
      )}

      {selected.layer === 'vessels' && swingR != null && (
        <div className="swing-box">
          <div className="swing-head">
            <span>Swing circle</span>
            <strong>{Math.round(swingR)} m</strong>
          </div>
          <dl className="swing-kv">
            <div>
              <dt>LOA</dt>
              <dd>{loa} m</dd>
            </div>
            <div>
              <dt>Factor</dt>
              <dd>x{swingFactor}</dd>
            </div>
            <div>
              <dt>Margin</dt>
              <dd>{SAFETY_MARGIN_NM} nautical miles</dd>
            </div>
            <div>
              <dt>Diameter</dt>
              <dd>{Math.round(swingR * 2)} m</dd>
            </div>
            <div>
              <dt>Safe area</dt>
              <dd>{((swingAreaM2 ?? 0) / 10000).toFixed(1)} ha</dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{VESSEL_LABELS[props.type as VesselType] ?? String(props.type)}</dd>
            </div>
          </dl>
        </div>
      )}

      {selected.layer === 'vessels' && (
        <div className="details-analysis">
          <p>
            <span className="muted">Inside area</span>{' '}
            {containment.length
              ? containment.map((a) => a.properties.name).join(', ')
              : 'Outside declared areas'}
          </p>
          {nearestBerth && (
            <p>
              <span className="muted">Nearest anchor berth</span>{' '}
              {nearestBerth.berth.properties.name} ·{' '}
              {formatDistance(nearestBerth.distanceM)}
            </p>
          )}
        </div>
      )}
    </aside>
  )
}
