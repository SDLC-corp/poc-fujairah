/**
 * The incident register.
 *
 * These are *records*, which is what makes them different from everything the
 * console works out on the fly. A dragging anchor detected by the drag watch is
 * a condition — true while it is true, gone when the vessel is back inside her
 * circle, and nothing to resolve. An incident is what the port wrote down about
 * it: it has an identity, a status somebody moved it to, a cause somebody
 * recorded, and a history that outlives the condition. That is why it can be
 * closed, and why it stays in the list afterwards.
 */

export type IncidentSeverity = 'high' | 'medium' | 'low'

/**
 * Open until somebody has dealt with it; resolved when the condition cleared;
 * closed when the file is finished with.
 *
 * Resolved and closed are not the same and the distinction earns its keep: a
 * vessel back inside her swing circle resolves the condition, but the report to
 * the Harbour Master may still be outstanding. Collapsing them would lose the
 * gap where the work actually sits.
 */
export type IncidentStatus = 'open' | 'resolved' | 'closed'

/**
 * What the register records.
 *
 * Three, and each one is a thing somebody has to go and do something about: get
 * a ship back on her anchor, boom and recover a slick, or get a vessel out of
 * water she must not be in. Proximity warnings and dropped transponders were
 * here and are not incidents in that sense — they are conditions the console
 * notices, and the dashboard's own feed is where those belong.
 */
export type IncidentTypeId = 'anchor-dragging' | 'oil-spill' | 'restricted-entry'

/**
 * The water an incident affects, as one of two shapes.
 *
 * Two rather than arbitrary GeoJSON, because these are the two an operator can
 * state and an operator can draw: corners round an extent, or a centre and a
 * radius. A circle keeps its centre and radius as the authored values and
 * carries a `ring` for drawing — the ring is derived, so it is never the thing
 * edited.
 */
export interface IncidentPolygon {
  kind: 'polygon'
  /** Closed ring, `[lon, lat]`, first point repeated last. */
  coordinates: [number, number][]
}

export interface IncidentCircle {
  kind: 'circle'
  centre: [number, number]
  radiusM: number
  /** Derived from centre and radius for drawing. Never edited directly. */
  ring?: [number, number][]
}

export type IncidentGeometry = IncidentPolygon | IncidentCircle

/** One thing that happened to the incident, in order. */
export interface IncidentEvent {
  at: string
  by: string
  event: string
  note: string
}

export interface IncidentNote {
  at: string
  by: string
  text: string
}

/** A vessel the incident involves, as the register holds her. */
export interface IncidentVessel {
  id: string
  name: string
  imo: string
  mmsi: string
  type: string
  lengthM: number
  flag: string
}

/**
 * Whatever was measured, per kind of incident.
 *
 * Deliberately open rather than a union of six shapes: what gets measured is a
 * property of the kind — metres dragged and wind for an anchor, a closest
 * approach for a proximity warning, a gap in minutes for a lost transponder —
 * and the screens render whatever is present rather than knowing each one.
 */
export type IncidentMeasurements = Partial<{
  dragDistanceM: number
  windKt: number
  /** Extent of a slick, taken from the shape drawn rather than stated apart from it. */
  affectedAreaKm2: number
  estimatedVolumeM3: number
  speedKn: number
  dwellMinutes: number
}>

export interface Incident {
  id: string
  type: IncidentTypeId
  typeLabel: string
  severity: IncidentSeverity
  status: IncidentStatus
  occurredAt: string
  reportedBy: string
  description: string
  /** The cause recorded against it, from the list offered for its kind. */
  reason: string
  /** Anchorage area code from the notice, e.g. `BN`. */
  area: string
  /**
   * Who was involved — none, one, or several.
   *
   * A list rather than a single vessel, and it can legitimately be empty. A
   * slick is reported before anybody knows which ship it came off, and a record
   * that cannot be filed until a source is named is a record nobody files at
   * the moment it matters. Two happens as well: a proximity event is about a
   * pair, and naming one of them makes the other look uninvolved.
   *
   * The incident is still about a patch of water either way — that is what the
   * geometry is for — so the vessels are what is *known* about it rather than
   * what defines it.
   */
  vessels: IncidentVessel[]
  measurements: IncidentMeasurements
  geometry: IncidentGeometry
  timeline: IncidentEvent[]
  notes: IncidentNote[]
}

/** public/data/incidents.json — see scripts/gen-incidents.mjs. */
export interface IncidentData {
  generatedAt: string
  count: number
  source: string
  incidents: Incident[]
}
