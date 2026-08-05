import { createSelector } from '@reduxjs/toolkit'
import {
  area,
  bbox,
  booleanIntersects,
  circle,
  booleanPointInPolygon,
  buffer,
  destination,
  distance,
  featureCollection,
  intersect,
  pointOnFeature,
} from '@turf/turf'
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiPolygon,
  Point,
  Polygon,
} from 'geojson'
import type { RootState } from '../../app/store'
import { buildVesselHull } from '../../map/vesselGeometry'
import type { HullProps } from '../../map/vesselGeometry'
import type {
  AnchorPointFeature,
  AreaFeature,
  GeofenceFeature,
  VesselFeature,
} from '../../types/gis'

export const selectAnchorages = (s: RootState) => s.portData.anchorages
export const selectVessels = (s: RootState) => s.portData.vessels
export const selectGeofences = (s: RootState) => s.portData.geofences
export const selectSelected = (s: RootState) => s.selection.selected
export const selectBufferRadiusKm = (s: RootState) => s.analysis.bufferRadiusKm
export const selectSwingFactor = (s: RootState) => s.analysis.swingFactor
export const selectSafetyMarginM = (s: RootState) => s.analysis.safetyMarginM

/**
 * Swing radius for one vessel, measured from the anchor: the cable paid out
 * plus the vessel's own length, plus the safety margin.
 */
export function swingRadiusM(lengthM: number, factor: number, marginM: number): number {
  return lengthM * factor + marginM
}

/**
 * Cable paid out, derived from the swing factor so the two can never disagree:
 * radius = cable + LOA + margin, therefore cable = LOA x (factor - 1).
 */
export function cableLengthM(lengthM: number, factor: number): number {
  return Math.max(0, lengthM * (factor - 1))
}

/**
 * Where the anchor is lying. A vessel at anchor rides back on its cable with
 * the bow towards the anchor, so the anchor sits ahead of the bow along the
 * heading — and it is the anchor, not the ship, that the swing circle turns
 * about.
 */
export function anchorPosition(
  coordinates: number[],
  lengthM: number,
  headingDeg: number,
  factor: number,
): [number, number] {
  const cableM = cableLengthM(lengthM, factor)
  if (cableM === 0) return coordinates as [number, number]
  return destination(coordinates, cableM / 1000, headingDeg, {
    units: 'kilometers',
  }).geometry.coordinates as [number, number]
}

type AreaPolygon = Feature<Polygon | MultiPolygon>

/* ------------------------------------------------------------------ *
 * The official dataset, split into the two shapes the app works with
 * ------------------------------------------------------------------ */

/** Declared areas: the 12 anchorages plus the Passage Way and Restricted Area. */
export const selectAreas = createSelector([selectAnchorages], (anchorages): AreaFeature[] =>
  (anchorages?.features ?? []).filter((f): f is AreaFeature => f.geometry.type === 'Polygon'),
)

/** The four Area T anchor berths, the only designated spots in the notice. */
export const selectAnchorBerths = createSelector(
  [selectAnchorages],
  (anchorages): AnchorPointFeature[] =>
    (anchorages?.features ?? []).filter(
      (f): f is AnchorPointFeature =>
        f.geometry.type === 'Point' && f.properties.category === 'anchor-berth',
    ),
)

/* ------------------------------------------------------------------ *
 * Label anchors: one point per polygon
 * ------------------------------------------------------------------ */

export interface LabelProps {
  id: string
  kind: 'anchorage'
  /** What the map draws: the area code for anchorages, the full name otherwise. */
  label: string
  isCode: boolean
  name: string
  [key: string]: unknown
}

/**
 * MapLibre places a polygon's label once per vector tile the polygon touches,
 * so an area spanning several tiles gets its name drawn several times. Labelling
 * a single interior point per feature instead keeps exactly one label.
 */
export const selectLabelPoints = createSelector(
  [selectAreas],
  (areas): FeatureCollection<Point, LabelProps> => ({
    type: 'FeatureCollection',
    features: areas.map((feature) => {
      // The published chart labels each anchorage with its letter only; the
      // Passage Way and Restricted Area are spelled out.
      const isCode = feature.properties.category === 'anchorage'
      return {
        type: 'Feature' as const,
        id: feature.properties.id,
        properties: {
          id: feature.properties.id,
          kind: 'anchorage' as const,
          label: isCode ? feature.properties.code : feature.properties.name,
          isCode,
          name: feature.properties.name,
        },
        geometry: pointOnFeature(feature).geometry,
      }
    }),
  }),
)

/* ------------------------------------------------------------------ *
 * 3D vessels: extrudable hull + deckhouse polygons per AIS point
 * ------------------------------------------------------------------ */

export const selectVesselHulls = createSelector(
  [selectVessels],
  (vessels): FeatureCollection<Polygon, HullProps> => ({
    type: 'FeatureCollection',
    features: (vessels?.features ?? []).flatMap(buildVesselHull),
  }),
)

/* ------------------------------------------------------------------ *
 * Swing circles: the water a vessel at anchor actually needs
 * ------------------------------------------------------------------ */

export interface SwingProps {
  id: string
  name: string
  radiusM: number
  [key: string]: unknown
}

export const selectSwingCircles = createSelector(
  [selectVessels, selectSwingFactor, selectSafetyMarginM],
  (vessels, factor, marginM): FeatureCollection<Polygon | Point, SwingProps> => ({
    type: 'FeatureCollection',
    features: (vessels?.features ?? []).flatMap((vessel) => {
      const radiusM = swingRadiusM(vessel.properties.lengthM, factor, marginM)
      // The circle turns about the anchor, not the ship: the vessel lies back
      // on its cable and sweeps this water as the tide and wind swing it round.
      const centre = anchorPosition(
        vessel.geometry.coordinates,
        vessel.properties.lengthM,
        vessel.properties.headingDeg,
        factor,
      )
      // 36 steps keeps ~500 circles cheap while still reading as round.
      const ring = circle(centre, radiusM / 1000, {
        units: 'kilometers',
        steps: 36,
      })
      const properties: SwingProps = {
        id: vessel.properties.id,
        name: vessel.properties.name,
        radiusM: Math.round(radiusM),
      }
      return [
        { type: 'Feature' as const, id: vessel.properties.id, properties, geometry: ring.geometry },
        // A circle spanning several tiles gets its label drawn once per tile, so
        // the readout hangs off a single point — set on the northern edge of the
        // ring, which stays clear of the extruded hull at any zoom.
        {
          type: 'Feature' as const,
          id: vessel.properties.id,
          properties,
          geometry: destination(centre, radiusM / 1000, 0, {
            units: 'kilometers',
          }).geometry,
        },
      ]
    }),
  }),
)

/* ------------------------------------------------------------------ *
 * Point-in-polygon: which declared area is each vessel lying in?
 * ------------------------------------------------------------------ */

export interface VesselAreaEntry {
  vessel: VesselFeature
  areas: AreaFeature[]
}

export const selectVesselAreaIndex = createSelector(
  [selectVessels, selectAreas],
  (vessels, areas): VesselAreaEntry[] =>
    (vessels?.features ?? []).map((vessel) => ({
      vessel,
      areas: areas.filter((a) => booleanPointInPolygon(vessel, a)),
    })),
)

/**
 * Vessels inside the Restricted Area — submarine pipelines, oil terminals and
 * SPMs, where the notice prohibits steaming and anchoring outright.
 */
export const selectRestrictedIncursions = createSelector([selectVesselAreaIndex], (index) =>
  index
    .map((entry) => ({
      vessel: entry.vessel,
      area: entry.areas.find((a) => a.properties.category === 'restricted'),
    }))
    .filter((entry): entry is { vessel: VesselFeature; area: AreaFeature } => Boolean(entry.area)),
)

/* ------------------------------------------------------------------ *
 * Occupancy: how many vessels are lying in each declared area
 * ------------------------------------------------------------------ */

export interface AreaOccupancy {
  area: AreaFeature
  count: number
  anchored: number
  underway: number
}

export const selectAreaOccupancy = createSelector(
  [selectVesselAreaIndex, selectAreas],
  (index, areas): AreaOccupancy[] => {
    const rows = new Map<string, AreaOccupancy>(
      areas.map((a) => [a.properties.id, { area: a, count: 0, anchored: 0, underway: 0 }]),
    )
    for (const entry of index) {
      for (const a of entry.areas) {
        const row = rows.get(a.properties.id)
        if (!row) continue
        row.count += 1
        if (entry.vessel.properties.status === 'underway') row.underway += 1
        else row.anchored += 1
      }
    }
    return [...rows.values()].sort((x, y) => y.count - x.count)
  },
)

/* ------------------------------------------------------------------ *
 * Free spots: where another vessel could actually be placed
 * ------------------------------------------------------------------ */

export interface FreeSpotProps {
  id: string
  area: string
  radiusM: number
  [key: string]: unknown
}

/** Hard cap so a very empty anchorage cannot flood the map with geometry. */
const MAX_FREE_SPOTS = 1200

/**
 * Lays the same hexagonal grid the sample fleet uses over each anchorage and
 * keeps the positions whose swing circle clears every vessel already lying
 * there. What is left is genuinely free water, not just unoccupied area.
 */
export const selectMovedSpots = (s: RootState) => s.spots.moved

export const selectFreeSpots = createSelector(
  [selectAreas, selectVesselAreaIndex, selectSwingFactor, selectSafetyMarginM, selectMovedSpots],
  (areas, index, factor, marginM, moved): FeatureCollection<Polygon, FreeSpotProps> => {
    const byArea = new Map<string, VesselFeature[]>()
    for (const entry of index) {
      for (const a of entry.areas) {
        const list = byArea.get(a.properties.id) ?? []
        list.push(entry.vessel)
        byArea.set(a.properties.id, list)
      }
    }

    const features: Feature<Polygon, FreeSpotProps>[] = []

    for (const areaFeature of areas) {
      if (areaFeature.properties.category !== 'anchorage') continue
      if (features.length >= MAX_FREE_SPOTS) break

      const here = byArea.get(areaFeature.properties.id) ?? []
      // Pitch on the largest vessel the area actually holds: a spot has to be
      // usable by the ships that berth there, and it keeps this grid aligned
      // with the one the fleet was laid out on.
      const referenceLoa = here.length
        ? Math.max(...here.map((v) => v.properties.lengthM))
        : DEFAULT_LOA_M
      const radiusM = swingRadiusM(referenceLoa, factor, marginM)
      const pitchM = radiusM * 2 * 1.03

      const [west, south, east, north] = bbox(areaFeature)
      const midLat = (south + north) / 2
      const stepLon = pitchM / (111320 * Math.cos((midLat * Math.PI) / 180))
      const stepLat = (pitchM * 0.866) / 111320
      const rows = Math.max(1, Math.floor((north - south) / stepLat))
      const cols = Math.max(1, Math.floor((east - west) / stepLon))
      const originLat = south + (north - south - (rows - 1) * stepLat) / 2
      const originLon = west + (east - west - (cols - 1) * stepLon) / 2

      for (let r = 0; r < rows; r++) {
        const rowOffset = r % 2 === 1 ? stepLon / 2 : 0
        for (let c = 0; c < cols; c++) {
          if (features.length >= MAX_FREE_SPOTS) break
          const lon = originLon + c * stepLon + rowOffset
          if (lon > east) continue
          const centre: [number, number] = [lon, originLat + r * stepLat]
          if (!booleanPointInPolygon(centre, areaFeature)) continue

          // A free spot is where the anchor would be let go, so the clearance
          // that matters is anchor-to-anchor: both swing circles turn about
          // those points, not about the hulls.
          const clashes = here.some((v) => {
            const theirAnchor = anchorPosition(
              v.geometry.coordinates,
              v.properties.lengthM,
              v.properties.headingDeg,
              factor,
            )
            const gap = distance(centre, theirAnchor, { units: 'kilometers' }) * 1000
            return gap < radiusM + swingRadiusM(v.properties.lengthM, factor, marginM)
          })
          if (clashes) continue

          const id = `FS-${areaFeature.properties.code}-${r}-${c}`
          features.push({
            type: 'Feature',
            id,
            properties: {
              id,
              area: areaFeature.properties.code,
              radiusM: Math.round(radiusM),
            },
            geometry: circle(centre, radiusM / 1000, { units: 'kilometers', steps: 28 }).geometry,
          })
        }
      }
    }

    // Hand-placed spots replace their grid position. Applied last so the grid
    // itself stays a pure function of the geometry.
    return {
      type: 'FeatureCollection',
      features: features.map((spot) => {
        const at = moved[spot.properties.id]
        if (!at) return spot
        return {
          ...spot,
          geometry: circle(at, spot.properties.radiusM / 1000, {
            units: 'kilometers',
            steps: 28,
          }).geometry,
        }
      }),
    }
  },
)

/* ------------------------------------------------------------------ *
 * Moving a spot by hand: is the new position legal?
 * ------------------------------------------------------------------ */

export interface SpotCheck {
  ok: boolean
  /** Anchorage area the centre falls in, if any. */
  areaCode: string | null
  /** Why it is refused, worst first. Empty when `ok`. */
  problems: string[]
}

/**
 * Geometry check for a relocated spot: it has to sit inside a declared
 * anchorage, outside the Restricted Area, clear of every vessel already at
 * anchor, and clear of the other free spots. Pure, so the map can run it on
 * every pointer move during a drag.
 */
export function checkSpotAt(
  at: [number, number],
  spotId: string,
  radiusM: number,
  areas: AreaFeature[],
  vessels: VesselFeature[],
  otherSpots: Feature<Polygon, FreeSpotProps>[],
  factor: number,
  marginM: number,
): SpotCheck {
  const problems: string[] = []

  const containing = areas.filter((a) => booleanPointInPolygon(at, a))
  const anchorage = containing.find((a) => a.properties.category === 'anchorage')
  const restricted = containing.find((a) => a.properties.category === 'restricted')

  if (restricted) problems.push(`Inside ${restricted.properties.name} — anchoring prohibited`)
  if (!anchorage) problems.push('Outside every declared anchorage area')

  // Anchor-to-anchor clearance against vessels already lying at anchor.
  const hits: { name: string; shortM: number }[] = []
  for (const v of vessels) {
    if (v.properties.status === 'awaiting') continue
    const theirAnchor = anchorPosition(
      v.geometry.coordinates,
      v.properties.lengthM,
      v.properties.headingDeg,
      factor,
    )
    const need = radiusM + swingRadiusM(v.properties.lengthM, factor, marginM)
    const gap = distance(at, theirAnchor, { units: 'kilometers' }) * 1000
    if (gap < need) hits.push({ name: v.properties.name, shortM: Math.round(need - gap) })
  }

  // …and against the other free spots, so two spots cannot be stacked.
  let spotClashes = 0
  for (const other of otherSpots) {
    if (other.properties.id === spotId) continue
    const centre = pointOnFeature(other).geometry.coordinates as [number, number]
    const need = radiusM + other.properties.radiusM
    if (distance(at, centre, { units: 'kilometers' }) * 1000 < need) spotClashes += 1
  }

  hits.sort((a, b) => b.shortM - a.shortM)
  for (const hit of hits.slice(0, 2)) {
    problems.push(`Overlaps ${hit.name} — ${hit.shortM} m short of clearance`)
  }
  if (hits.length > 2) problems.push(`…and ${hits.length - 2} more vessels`)
  if (spotClashes > 0) {
    problems.push(`Overlaps ${spotClashes} other free ${spotClashes === 1 ? 'spot' : 'spots'}`)
  }

  return { ok: problems.length === 0, areaCode: anchorage?.properties.code ?? null, problems }
}

/* ------------------------------------------------------------------ *
 * Capacity: occupied spots plus the free ones that were found
 * ------------------------------------------------------------------ */

export interface AreaCapacity {
  area: AreaFeature
  capacity: number
  occupied: number
  available: number
}

const DEFAULT_LOA_M = 200

/**
 * Occupied is what is lying there; available is how many free circles were
 * actually found, so the figures always agree with what the map draws.
 */
export const selectAreaCapacity = createSelector(
  [selectAreas, selectVesselAreaIndex, selectFreeSpots],
  (areas, index, freeSpots): AreaCapacity[] => {
    const occupiedBy = new Map<string, number>()
    for (const entry of index) {
      for (const a of entry.areas) {
        occupiedBy.set(a.properties.id, (occupiedBy.get(a.properties.id) ?? 0) + 1)
      }
    }

    const freeBy = new Map<string, number>()
    for (const spot of freeSpots.features) {
      const code = spot.properties.area
      freeBy.set(code, (freeBy.get(code) ?? 0) + 1)
    }

    return areas
      .filter((a) => a.properties.category === 'anchorage')
      .map((a) => {
        const occupied = occupiedBy.get(a.properties.id) ?? 0
        const available = freeBy.get(a.properties.code) ?? 0
        return { area: a, capacity: occupied + available, occupied, available }
      })
      .sort((x, y) => y.occupied - x.occupied)
  },
)

/* ------------------------------------------------------------------ *
 * Anchor marks: where each anchored vessel's ground tackle lies
 * ------------------------------------------------------------------ */

export interface AnchorMarkProps {
  id: string
  kind: 'anchor' | 'chain'
  [key: string]: unknown
}

/**
 * A vessel at anchor lies back on its cable, so the anchor sits ahead of the
 * bow. Drawn as the anchor itself plus the chain running back to the ship.
 */
export const selectAnchorMarks = createSelector(
  [selectVessels, selectSwingFactor],
  (vessels, factor): FeatureCollection<Point | LineString, AnchorMarkProps> => {
    const features: Feature<Point | LineString, AnchorMarkProps>[] = []

    for (const vessel of vessels?.features ?? []) {
      if (vessel.properties.status !== 'anchored') continue
      // Same anchor the swing circle is drawn about.
      const drop = anchorPosition(
        vessel.geometry.coordinates,
        vessel.properties.lengthM,
        vessel.properties.headingDeg,
        factor,
      )
      const id = vessel.properties.id
      features.push({
        type: 'Feature',
        id,
        properties: { id, kind: 'chain' },
        geometry: {
          type: 'LineString',
          coordinates: [vessel.geometry.coordinates, drop],
        },
      })
      features.push({
        type: 'Feature',
        id,
        properties: { id, kind: 'anchor' },
        geometry: { type: 'Point', coordinates: drop },
      })
    }

    return { type: 'FeatureCollection', features }
  },
)

/* ------------------------------------------------------------------ *
 * Geofences: operator-drawn incident boundaries
 * ------------------------------------------------------------------ */

/** The transit corridor from the notice, used to route inbound vessels. */
export const selectPassageWay = createSelector(
  [selectAreas],
  (areas): AreaFeature | null =>
    areas.find((a) => a.properties.category === 'passage') ?? null,
)

/** Only the fences an operator has switched on. */
export const selectActiveGeofences = createSelector(
  [selectGeofences],
  (geofences): GeofenceFeature[] => (geofences?.features ?? []).filter((f) => f.properties.active),
)

export interface GeofenceBreach {
  fence: GeofenceFeature
  vessels: VesselFeature[]
}

/** Which vessels are sitting inside an active fence right now. */
export const selectGeofenceBreaches = createSelector(
  [selectActiveGeofences, selectVessels],
  (fences, vessels): GeofenceBreach[] =>
    fences
      .map((fence) => ({
        fence,
        vessels: (vessels?.features ?? []).filter((v) => booleanPointInPolygon(v, fence)),
      }))
      .filter((row) => row.vessels.length > 0)
      .sort((a, b) => b.vessels.length - a.vessels.length),
)

/* ------------------------------------------------------------------ *
 * Assignment: match waiting vessels to a free spot in a suitable area
 * ------------------------------------------------------------------ */

/**
 * Which areas suit which vessel, from what the notice designates each area for.
 * Order is preference order.
 */
const AREA_PREFERENCE: Record<string, string[]> = {
  lngcarrier: ['G', 'D', 'BN', 'BS'],
  chemicaltanker: ['D', 'BN', 'BS', 'S', 'T'],
  container: ['A', 'W', 'BN', 'BS'],
  bulkcarrier: ['A', 'W', 'BN', 'BS'],
  generalcargo: ['A', 'W', 'C', 'BS'],
  carcarrier: ['A', 'W', 'BN'],
  livestockcarrier: ['W', 'A', 'BS'],
  heavyliftvsl: ['C', 'W', 'A'],
  barge: ['C', 'W'],
  crewboat: ['C'],
  divingsupport: ['C'],
  dredger: ['C'],
  cableship: ['C'],
  landingcraft: ['C', 'W'],
}
/** Areas VN and VS exist for vessels over 300 m, so they come first for those. */
const LARGE_VESSEL_AREAS = ['VN', 'VS']
const LARGE_VESSEL_M = 300

export interface SpotOption {
  spotId: string
  areaCode: string
  /** Centre of the free circle — where the vessel is walked to. */
  coordinates: [number, number]
  distanceM: number
  /** Spare radius over what this vessel needs, in metres. */
  slackM: number
}

export interface AssignmentCandidate {
  vessel: VesselFeature
  requiredRadiusM: number
  recommended: SpotOption | null
  alternatives: SpotOption[]
  /** Areas that suit the vessel but have nothing free. */
  fullAreas: string[]
  /**
   * Best free spot in EVERY anchorage that can physically take this vessel —
   * what a manual override can choose from, including areas the notice does not
   * designate for it.
   */
  areaOptions: SpotOption[]
  /** Areas the notice designates for this vessel, in preference order. */
  designatedAreas: string[]
}

export const selectAwaitingVessels = createSelector([selectVessels], (vessels): VesselFeature[] =>
  (vessels?.features ?? []).filter((v) => v.properties.status === 'awaiting'),
)

/**
 * Ranks the free spots for each waiting vessel: the area has to be designated
 * for that vessel, the spot has to be big enough for its swing circle, and of
 * those the nearest wins.
 */
export const selectAssignmentQueue = createSelector(
  [selectAwaitingVessels, selectFreeSpots, selectAreaCapacity, selectSwingFactor, selectSafetyMarginM],
  (awaiting, freeSpots, capacity, factor, marginM): AssignmentCandidate[] => {
    const availableByArea = new Map(capacity.map((r) => [r.area.properties.code, r.available]))

    return awaiting.map((vessel) => {
      const requiredRadiusM = swingRadiusM(vessel.properties.lengthM, factor, marginM)
      const preferred =
        vessel.properties.lengthM > LARGE_VESSEL_M
          ? [...LARGE_VESSEL_AREAS, ...(AREA_PREFERENCE[vessel.properties.type] ?? [])]
          : (AREA_PREFERENCE[vessel.properties.type] ?? ['A', 'W'])

      const options: SpotOption[] = []
      for (const spot of freeSpots.features) {
        const areaCode = spot.properties.area
        if (!preferred.includes(areaCode)) continue
        // The spot was sized for the area's largest resident; it must still fit.
        if (spot.properties.radiusM < requiredRadiusM) continue
        const centre = pointOnFeature(spot)
        options.push({
          spotId: spot.properties.id,
          areaCode,
          coordinates: centre.geometry.coordinates as [number, number],
          distanceM: distance(vessel, centre, { units: 'kilometers' }) * 1000,
          slackM: Math.round(spot.properties.radiusM - requiredRadiusM),
        })
      }

      // Preference order first, then proximity within the preferred area.
      options.sort((a, b) => {
        const rank = preferred.indexOf(a.areaCode) - preferred.indexOf(b.areaCode)
        return rank !== 0 ? rank : a.distanceM - b.distanceM
      })

      const chosenAreas = new Set<string>()
      const alternatives: SpotOption[] = []
      for (const option of options.slice(1)) {
        if (chosenAreas.has(option.areaCode) || option.areaCode === options[0]?.areaCode) continue
        chosenAreas.add(option.areaCode)
        alternatives.push(option)
        if (alternatives.length === 2) break
      }

      // For a manual override, offer the nearest big-enough spot in each area,
      // whether or not the notice designates that area for this vessel.
      const bestPerArea = new Map<string, SpotOption>()
      for (const spot of freeSpots.features) {
        if (spot.properties.radiusM < requiredRadiusM) continue
        const centre = pointOnFeature(spot)
        const option: SpotOption = {
          spotId: spot.properties.id,
          areaCode: spot.properties.area,
          coordinates: centre.geometry.coordinates as [number, number],
          distanceM: distance(vessel, centre, { units: 'kilometers' }) * 1000,
          slackM: Math.round(spot.properties.radiusM - requiredRadiusM),
        }
        const held = bestPerArea.get(option.areaCode)
        if (!held || option.distanceM < held.distanceM) bestPerArea.set(option.areaCode, option)
      }

      return {
        vessel,
        requiredRadiusM: Math.round(requiredRadiusM),
        recommended: options[0] ?? null,
        alternatives,
        fullAreas: preferred.filter((code) => (availableByArea.get(code) ?? 0) === 0),
        areaOptions: [...bestPerArea.values()].sort((a, b) =>
          a.areaCode.localeCompare(b.areaCode),
        ),
        designatedAreas: preferred,
      }
    })
  },
)

/* ------------------------------------------------------------------ *
 * Distance: nearest designated anchor berth (great-circle, metres)
 * ------------------------------------------------------------------ */

export interface NearestBerth {
  berth: AnchorPointFeature
  distanceM: number
}

export const selectNearestBerthByVessel = createSelector(
  [selectVessels, selectAnchorBerths],
  (vessels, berths): Record<string, NearestBerth> => {
    const out: Record<string, NearestBerth> = {}
    if (!vessels || berths.length === 0) return out

    for (const vessel of vessels.features) {
      let best: NearestBerth | null = null
      for (const berth of berths) {
        const distanceM = distance(vessel, berth, { units: 'kilometers' }) * 1000
        if (!best || distanceM < best.distanceM) best = { berth, distanceM }
      }
      if (best) out[vessel.properties.id] = best
    }
    return out
  },
)

/* ------------------------------------------------------------------ *
 * Selection-driven proximity analysis
 * ------------------------------------------------------------------ */

export const selectSelectedVessel = createSelector(
  [selectVessels, selectSelected],
  (vessels, selected): VesselFeature | null => {
    if (!vessels || selected?.layer !== 'vessels') return null
    return vessels.features.find((v) => v.properties.id === selected.id) ?? null
  },
)

export const selectBufferFeature = createSelector(
  [selectSelectedVessel, selectBufferRadiusKm],
  (vessel, radiusKm): AreaPolygon | null => {
    if (!vessel || radiusKm <= 0) return null
    return (buffer(vessel, radiusKm, { units: 'kilometers', steps: 64 }) as AreaPolygon) ?? null
  },
)

export interface ProximityResult {
  vessels: { vessel: VesselFeature; distanceM: number }[]
  berths: AnchorPointFeature[]
  areas: { area: AreaFeature; overlapM2: number }[]
}

export const selectProximityResult = createSelector(
  [selectBufferFeature, selectSelectedVessel, selectVessels, selectAnchorBerths, selectAreas],
  (bufferPoly, selectedVessel, vessels, berths, areas): ProximityResult | null => {
    if (!bufferPoly || !selectedVessel) return null

    const nearbyVessels = (vessels?.features ?? [])
      .filter(
        (v) =>
          v.properties.id !== selectedVessel.properties.id && booleanPointInPolygon(v, bufferPoly),
      )
      .map((v) => ({
        vessel: v,
        distanceM: distance(selectedVessel, v, { units: 'kilometers' }) * 1000,
      }))
      .sort((a, b) => a.distanceM - b.distanceM)

    const nearbyBerths = berths.filter((b) => booleanPointInPolygon(b, bufferPoly))

    // How much of each declared area the search radius actually covers.
    const overlaps: { area: AreaFeature; overlapM2: number }[] = []
    for (const declared of areas) {
      if (!booleanIntersects(bufferPoly, declared)) continue
      const clipped = intersect(featureCollection<Polygon | MultiPolygon>([bufferPoly, declared]))
      if (!clipped) continue
      overlaps.push({ area: declared, overlapM2: area(clipped) })
    }
    overlaps.sort((a, b) => b.overlapM2 - a.overlapM2)

    return { vessels: nearbyVessels, berths: nearbyBerths, areas: overlaps }
  },
)

/** Line from the selected vessel to its nearest designated anchor berth. */
export const selectNearestBerthLine = createSelector(
  [selectSelectedVessel, selectNearestBerthByVessel],
  (vessel, nearest) => {
    if (!vessel) return null
    const match = nearest[vessel.properties.id]
    if (!match) return null
    return {
      berth: match.berth,
      distanceM: match.distanceM,
      line: {
        type: 'Feature' as const,
        properties: { distanceM: match.distanceM },
        geometry: {
          type: 'LineString' as const,
          coordinates: [vessel.geometry.coordinates, match.berth.geometry.coordinates],
        },
      },
    }
  },
)
