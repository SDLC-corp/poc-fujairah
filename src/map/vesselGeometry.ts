import { destination } from '@turf/turf'
import type { Feature, Polygon, Position } from 'geojson'
import type { VesselFeature } from '../types/gis'

/**
 * Vessel heights are a few tens of metres against hulls hundreds of metres long,
 * which reads as flat at port-wide zoom levels. Extrusions are exaggerated so the
 * 3D shape is legible; the footprint stays true to scale.
 */
export const HEIGHT_EXAGGERATION = 1.5

/** Hull outline in (beam, length) fractions — the classic AIS pointed-bow shape. */
const HULL: Array<[number, number]> = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.14],
  [0, 0.5],
  [-0.5, 0.14],
]

/** Deckhouse block, sitting aft on the hull. */
const SUPERSTRUCTURE: Array<[number, number]> = [
  [-0.34, -0.44],
  [0.34, -0.44],
  [0.34, -0.24],
  [-0.34, -0.24],
]

export interface HullProps {
  id: string
  name: string
  type: string
  part: 'hull' | 'superstructure'
  base: number
  height: number
  [key: string]: unknown
}

/**
 * Projects a point given in the vessel's local frame (metres; +x starboard,
 * +y towards the bow) onto the globe, rotated by the vessel's heading.
 */
function localToLngLat(centre: Position, headingDeg: number, x: number, y: number): Position {
  const distanceM = Math.hypot(x, y)
  if (distanceM === 0) return centre
  const bearing = headingDeg + (Math.atan2(x, y) * 180) / Math.PI
  return destination(centre, distanceM / 1000, bearing, { units: 'kilometers' }).geometry.coordinates
}

function ring(
  centre: Position,
  headingDeg: number,
  outline: Array<[number, number]>,
  beamM: number,
  lengthM: number,
): Position[] {
  const points = outline.map(([fx, fy]) =>
    localToLngLat(centre, headingDeg, fx * beamM, fy * lengthM),
  )
  return [...points, points[0]]
}

/** Freeboard-ish hull height, then the deckhouse stacked on top of it. */
function heights(lengthM: number) {
  const hull = Math.min(30, Math.max(6, lengthM / 11)) * HEIGHT_EXAGGERATION
  const deck = Math.min(26, Math.max(7, lengthM / 14)) * HEIGHT_EXAGGERATION
  return { hull, deck }
}

/**
 * Turns an AIS point into the two extrudable polygons that make up its 3D shape.
 * Both carry the vessel id so a single feature-state drives the whole ship.
 */
export function buildVesselHull(vessel: VesselFeature): Array<Feature<Polygon, HullProps>> {
  const { id, name, type, lengthM, beamM, headingDeg } = vessel.properties
  const centre = vessel.geometry.coordinates
  const { hull, deck } = heights(lengthM)

  const make = (
    outline: Array<[number, number]>,
    part: HullProps['part'],
    base: number,
    height: number,
  ): Feature<Polygon, HullProps> => ({
    type: 'Feature',
    id,
    properties: { id, name, type, part, base, height },
    geometry: {
      type: 'Polygon',
      coordinates: [ring(centre, headingDeg, outline, beamM, lengthM)],
    },
  })

  return [
    make(HULL, 'hull', 0, hull),
    make(SUPERSTRUCTURE, 'superstructure', hull, hull + deck),
  ]
}
