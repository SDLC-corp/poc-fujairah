import { useAppDispatch, useAppSelector } from '../app/hooks'
import { distance } from '@turf/turf'
import {
  anchorPosition,
  DRAG_TOLERANCE_M,
  selectCableM,
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
import { formatDateTime, formatDistance, formatLatLon, titleCase } from '../utils/format'
import CopyButton from './CopyButton'
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

/** Shown in their own block, or not worth a row on a card this size. */
const SKIP_KEYS = new Set(['request', 'anchoredAt', 'anchoredHeadingDeg'])

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

/**
 * One position, in both the forms the card shows it.
 *
 * Copied together rather than as a choice, because the two readers want
 * different ones and the operator copying it does not know which they are
 * writing to: a bridge plots degrees and minutes, anything that parses the
 * paste wants decimal.
 */
const posLines = (c: number[]) =>
  `${formatLatLon(c[1], c[0])}  (${c[1].toFixed(5)}°N, ${c[0].toFixed(5)}°E)`

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
  const cableM = useAppSelector(selectCableM)
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

  /**
   * Where she was put, and where she is.
   *
   * Two different facts that a single "position" row cannot tell apart. The
   * given position is the spot she was ordered to and brought up on; the actual
   * position is where the last fix puts her. A vessel at anchor rides round her
   * ground tackle, so the two are *expected* to differ — which is exactly why
   * both have to be on the card rather than one standing in for the other.
   *
   * The run underneath is not the gap between those two points, though: that
   * gap is mostly swing. It is the gap between where the anchor was let go and
   * where the anchor must be now, worked from each position and heading in
   * turn — the same comparison the drag alarm makes, so the card and the alarm
   * can never disagree.
   */
  const anchoredAt = props.anchoredAt as [number, number] | null | undefined
  const nowAt = feature.geometry.type === 'Point' ? (feature.geometry.coordinates as number[]) : null
  const anchorRun =
    anchoredAt && nowAt
      ? distance(
          anchorPosition(
            anchoredAt,
            (props.anchoredHeadingDeg as number) ?? (props.headingDeg as number),
            cableM,
          ),
          anchorPosition(nowAt, props.headingDeg as number, cableM),
          { units: 'kilometers' },
        ) * 1000
      : null
  const dragging = anchorRun != null && anchorRun > DRAG_TOLERANCE_M

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

      <dl>
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{labelFor(key)}</dt>
            <dd>{renderValue(key, value)}</dd>
          </div>
        ))}
      </dl>

      {selected.layer === 'vessels' && anchoredAt && nowAt && (
        <div className="anchor-box">
          <div className="swing-head">
            <span>Anchor position</span>
            <span className="anchor-head-right">
              {anchorRun != null && (
                <strong className={dragging ? 'is-alert' : undefined}>
                  {dragging ? `dragged ${Math.round(anchorRun)} m` : 'holding'}
                </strong>
              )}
              {/* The whole block, for pasting into a log, a handover note or a
                  message to the bridge — which is what these figures are for. */}
              <CopyButton
                label="both positions"
                value={[
                  `${String(props.name ?? selected.id)} — anchor position`,
                  `Given   ${posLines(anchoredAt)}`,
                  `Actual  ${posLines(nowAt)}`,
                  anchorRun == null
                    ? ''
                    : dragging
                      ? `Anchor has run ${Math.round(anchorRun)} m from where it was let go.`
                      : 'Holding — the difference is swing, not drag.',
                ]
                  .filter(Boolean)
                  .join('\n')}
              />
            </span>
          </div>
          <dl className="anchor-kv">
            <div>
              <dt title="The spot she was given, and where she brought up.">
                Given
                <CopyButton label="the given position" value={posLines(anchoredAt)} />
              </dt>
              <dd>
                <span className="pos-dmm">{formatLatLon(anchoredAt[1], anchoredAt[0])}</span>
                <small className="muted">
                  {anchoredAt[1].toFixed(5)}°N, {anchoredAt[0].toFixed(5)}°E
                </small>
              </dd>
            </div>
            <div>
              <dt title="Where the last position report puts her.">
                Actual
                <CopyButton label="the actual position" value={posLines(nowAt)} />
              </dt>
              <dd>
                <span className="pos-dmm">{formatLatLon(nowAt[1], nowAt[0])}</span>
                <small className="muted">
                  {nowAt[1].toFixed(5)}°N, {nowAt[0].toFixed(5)}°E
                </small>
              </dd>
            </div>
          </dl>
          <p className="muted anchor-note">
            {dragging
              ? 'Her anchor is no longer where it was let go — she is running.'
              : 'She is riding to her cable; the difference above is swing, not drag.'}
          </p>
        </div>
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
