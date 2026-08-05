import type { Feature, FeatureCollection, Point, Polygon } from 'geojson'

export type LayerId = 'anchorages' | 'vessels' | 'swing' | 'freeSpots' | 'geofences'

// Declared as `type` rather than `interface` so they keep an implicit index
// signature and stay assignable to GeoJSON's `GeoJsonProperties` in Turf calls.

/** A feature of the official Fujairah Anchorage Area dataset. */
export type AnchorageProps = {
  id: string
  name: string
  /** Area letter from the notice, e.g. A, BN, VS. */
  code: string
  category: 'anchorage' | 'passage' | 'restricted' | 'anchor-berth' | 'buoy'
  purpose: string
  authority: string
  source: string
}

/** AIS vessel categories carried by the feed, matching the supplied palette. */
export type VesselType =
  | 'barge'
  | 'bulkcarrier'
  | 'cableship'
  | 'carcarrier'
  | 'chemicaltanker'
  | 'container'
  | 'crewboat'
  | 'divingsupport'
  | 'dredger'
  | 'generalcargo'
  | 'heavyliftvsl'
  | 'landingcraft'
  | 'livestockcarrier'
  | 'lngcarrier'

/**
 * Why the vessel is calling. These follow the area designations in Notice to
 * Mariners No. 346 one-for-one, so a purpose maps directly onto the anchorage
 * areas the Harbour Master would direct the vessel to.
 */
export type CallPurpose =
  | 'awaiting-orders'
  | 'waiting-berth'
  | 'bunkering'
  | 'marine-services'
  | 'hazardous-services'
  | 'lng-sts'
  | 'oil-sts'
  | 'spm'
  | 'naval'

export type CargoKind =
  | 'none'
  | 'liquid-bulk'
  | 'dry-bulk'
  | 'gas'
  | 'container'
  | 'general'
  | 'ro-ro'

export type RequiredService =
  | 'fuel'
  | 'lube-oil'
  /** Discharge of oily residues and tank washings — MARPOL Annex I slops. */
  | 'de-sloping'
  | 'water'
  | 'stores'
  | 'crew-change'
  | 'repairs'
  | 'tug'
  /** Garbage reception — MARPOL Annex V, distinct from de-sloping. */
  | 'waste'

/**
 * The anchorage request an agent files before arrival. Everything here is
 * declared by the agent rather than derived from AIS, so it is kept apart from
 * the vessel's live position data.
 */
export interface AnchorageRequest {
  mmsi: string | null
  callSign: string | null
  dwtT: number | null
  gt: number | null
  lastPort: string
  nextPort: string
  agent: string
  purpose: CallPurpose
  /** Destination, when the call is for a berth or SPM rather than open anchorage. */
  terminal: string | null
  berth: string | null
  spmNumber: string | null
  cargoType: CargoKind
  cargoName: string
  hazardous: boolean
  /** IMDG class, only meaningful when `hazardous` is true. */
  imoClass: string | null
  quantityT: number | null
  services: RequiredService[]
  submittedAt: string
}

export type VesselProps = {
  id: string
  name: string
  imo: string
  type: VesselType
  flag: string
  lengthM: number
  beamM: number
  draftM: number
  speedKn: number
  headingDeg: number
  /** `awaiting` means outside the declared areas, queued for a spot. */
  status: 'moored' | 'anchored' | 'underway' | 'awaiting'
  /** Area code the vessel was placed in, e.g. BN. Optional — derived live too. */
  area?: string | null
  /** Estimated time of arrival, ISO 8601 — set on vessels awaiting assignment. */
  eta?: string
  /** Actual time of arrival, ISO 8601. */
  ata?: string | null
  /** Estimated time of departure, ISO 8601. */
  etd?: string | null
  /** Actual time of departure, ISO 8601 — set once the vessel has sailed. */
  atd?: string | null
  /** Present only on vessels entered through the anchorage request form. */
  request?: AnchorageRequest
}

export type AnchorageFeature = Feature<Polygon | Point, AnchorageProps>
export type AnchorageCollection = FeatureCollection<Polygon | Point, AnchorageProps>

/** An anchorage feature narrowed to its polygon form. */
export type AreaFeature = Feature<Polygon, AnchorageProps>
/** An anchorage feature narrowed to its point form (anchor berths, buoys). */
export type AnchorPointFeature = Feature<Point, AnchorageProps>

/** Operator-drawn boundary, independent of the official areas. */
export type GeofenceProps = {
  id: string
  name: string
  kind: 'advisory' | 'exclusion'
  /** What prompted the fence, e.g. "Hydrocarbon spill". */
  cause: string
  /** Anchorage code the incident sits in. */
  area: string
  rule: string
  active: boolean
  owner: string
  createdAt: string
}

export type GeofenceFeature = Feature<Polygon, GeofenceProps>
export type GeofenceCollection = FeatureCollection<Polygon, GeofenceProps>

export type VesselFeature = Feature<Point, VesselProps>
export type VesselCollection = FeatureCollection<Point, VesselProps>

/** A map feature the user has clicked on, identified by its layer and id. */
export interface SelectedFeature {
  layer: LayerId
  id: string
}
