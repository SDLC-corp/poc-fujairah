import { centroid } from '@turf/turf'
import type { Feature } from 'geojson'
import type { DraggingVessel, GeofenceBreach } from '../analysis/selectors'
import type { AreaFeature, VesselFeature } from '../../types/gis'
import type { Incident } from '../../types/incident'
import type { IncidentSubject } from '../../components/SendIncidentMailDialog'
import { areaLabel } from '../incidentRegister/registerSlice'
import { formatDistance, formatLatLon } from '../../utils/format'

/**
 * How an incident is described when it is reported, in one place.
 *
 * Three screens can raise the same incident — the dashboard feed, the incidents
 * log and the drag banner — and an incident that reads one way on one of them
 * and another way on the next is not one incident. So the wording, the facts
 * quoted and the reasons offered are built here and the screens only choose
 * which builder to call.
 */

/**
 * What an operator is likely to be reporting, per kind of incident.
 *
 * Kept apart rather than pooled into one list, because the useful answers are
 * not the same: a ship inside a prohibited area is a matter of orders given,
 * while an anchorage at its limit is a matter of what is being done about the
 * queue. A single list covering both would be mostly wrong every time.
 */
export const REASONS: Record<string, string[]> = {
  drag: [
    'Shamal — strong north-westerly',
    'Insufficient cable veered',
    'Poor holding ground',
    'Heavy swell',
    'Vessel manoeuvring on her anchor',
    'Cause not yet established',
    'Other',
  ],
  geofence: [
    'Vessel ordered to leave the area',
    'Entry permitted — working under escort',
    'Awaiting master response',
    'Cause not yet established',
    'Other',
  ],
  restricted: [
    'Vessel ordered to leave immediately',
    'Vessel in distress — entry unavoidable',
    'Navigational error',
    'Awaiting master response',
    'Reported to the Harbour Master',
    'Other',
  ],
  spill: [
    'Bunkering transfer overflow',
    'Hose failure during transfer',
    'Discharge of oily residues',
    'SPM coupling leak',
    'Booms deployed — recovery under way',
    'Source not yet established',
    'Other',
  ],
  occupancy: [
    'Arrivals being diverted to another area',
    'Spots being released',
    'No action — short-lived peak',
    'Escalated to the Harbour Master',
    'Other',
  ],
  traffic: ['Routine movement — no action', 'Speed advisory issued', 'Awaiting master response', 'Other'],
}

/**
 * A place for anything with geometry.
 *
 * A polygon reports its middle rather than a corner — "Area A" means the water,
 * and the middle of it is the only point that stands for the whole. A vessel
 * reports where she is.
 */
export function placeOf(feature: Feature | null | undefined) {
  if (!feature) return null
  const [lon, lat] = (
    feature.geometry.type === 'Point'
      ? feature.geometry.coordinates
      : centroid(feature).geometry.coordinates
  ) as [number, number]
  return { lat, lon }
}

/** A vessel whose anchor has moved. */
export function dragSubject(d: DraggingVessel): IncidentSubject {
  const p = d.vessel.properties
  return {
    title: `${p.name} — anchor dragging`,
    subtitle: p.area ? `Area ${p.area}` : 'Outside the declared areas',
    lines: [
      `Anchor has run ${formatDistance(d.driftM)} from where it was let go,`,
      `outside her ${d.radiusM} m swing circle.`,
      '',
      `Let go at   ${formatLatLon(d.laidAt[1], d.laidAt[0])}`,
    ],
    // Where the anchor is now — the position anyone going to look for her
    // needs. Where it was let go is above, as the comparison.
    position: { lat: d.anchorNow[1], lon: d.anchorNow[0] },
    reasons: REASONS.drag,
  }
}

/** Vessels sitting inside an operator-drawn fence. */
export function geofenceSubject(b: GeofenceBreach): IncidentSubject {
  const f = b.fence.properties
  const n = b.vessels.length
  return {
    title: `${n} ${n === 1 ? 'vessel' : 'vessels'} inside ${f.name}`,
    subtitle: `${f.kind === 'exclusion' ? 'Exclusion zone' : 'Advisory zone'} · Area ${f.area} · ${f.cause}`,
    lines: [`Vessels: ${b.vessels.map((v) => v.properties.name).join(', ')}`, `Rule: ${f.rule}`],
    // The fence, not one of the ships inside it: the fence is the thing the
    // reader is being sent to look at.
    position: placeOf(b.fence),
    reasons: REASONS.geofence,
  }
}

/**
 * A record out of the register, rather than a condition detected live.
 *
 * The other three builders take what a selector worked out this second. This
 * one takes a record that was written down — so the facts come off the record
 * instead of being recomputed, and the reason offered first is the cause already
 * recorded against it. Re-deriving them would let a broadcast disagree with the
 * file it was sent about.
 */
export function recordSubject(i: Incident): IncidentSubject {
  const m = i.measurements
  const lines = [
    // One line per vessel while there are few, because the particulars matter;
    // a bare count past that, because a broadcast read aloud cannot carry six
    // sets of them. Nothing at all when none is named, rather than a line
    // saying so — the description already does.
    ...(i.vessels.length <= 2
      ? i.vessels.map((v) => `${v.name} · IMO ${v.imo} · ${v.lengthM} m LOA`)
      : [`${i.vessels.length} vessels: ${i.vessels.map((v) => v.name).join(', ')}`]),
    ...(m.dragDistanceM != null ? [`Dragged ${m.dragDistanceM} m.`] : []),
    ...(m.affectedAreaKm2 != null ? [`Slick about ${m.affectedAreaKm2} km².`] : []),
    ...(m.estimatedVolumeM3 != null ? [`Estimated ${m.estimatedVolumeM3} m³.`] : []),
    ...(m.speedKn != null ? [`Making ${m.speedKn} kn.`] : []),
    ...(m.windKt != null ? [`Wind ${m.windKt} kt.`] : []),
    ...(m.dwellMinutes != null ? [`Inside for ${m.dwellMinutes} min.`] : []),
  ]

  return {
    title: `${i.id} — ${i.typeLabel}`,
    subtitle: `${areaLabel(i.area)}${
      i.vessels.length === 1
        ? ` · ${i.vessels[0].name}`
        : i.vessels.length > 1
          ? ` · ${i.vessels.length} vessels`
          : ''
    }`,
    lines,
    position:
      i.geometry.kind === 'circle'
        ? { lat: i.geometry.centre[1], lon: i.geometry.centre[0] }
        : placeOf({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [i.geometry.coordinates] },
          }),
    // The recorded cause leads, because it is the answer somebody already gave.
    reasons: [i.reason, ...(REASONS[typeToReasonKey(i.type)] ?? []).filter((r) => r !== i.reason)],
  }
}

/**
 * Which reason list a register type draws from.
 *
 * Exported because the report form and the draw screen need the same mapping,
 * and a type offered one set of causes on one screen and another set on the
 * next would make the register's own `reason` field meaningless.
 */
export const REASON_KEY: Record<Incident['type'], string> = {
  'anchor-dragging': 'drag',
  'oil-spill': 'spill',
  'restricted-entry': 'restricted',
}

function typeToReasonKey(type: Incident['type']): string {
  return REASON_KEY[type] ?? 'traffic'
}

/** A vessel inside the Restricted Area, where anchoring is prohibited. */
export function restrictedSubject(i: {
  vessel: VesselFeature
  area: AreaFeature
}): IncidentSubject {
  const p = i.vessel.properties
  return {
    title: `${p.name} — inside ${i.area.properties.name}`,
    subtitle: 'Anchoring and steaming prohibited',
    lines: [
      `IMO ${p.imo} · ${p.lengthM} m LOA · making ${p.speedKn} kn`,
      `Authority: ${i.area.properties.authority}`,
    ],
    // Where she actually is, which is the point of the report.
    position: placeOf(i.vessel),
    reasons: REASONS.restricted,
  }
}
