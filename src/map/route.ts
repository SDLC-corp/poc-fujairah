import { bbox, booleanPointInPolygon } from '@turf/turf'
import type { Feature, Polygon, Position } from 'geojson'

/** Sampling resolution when locating the corridor's running line. */
const LAT_STEPS = 96
const LON_STEPS = 48

/** One lane latitude per passage feature — the search is pure, so cache it. */
const laneCache = new WeakMap<Feature<Polygon>, number>()

/**
 * Latitude of the corridor's running line.
 *
 * The Passage Way is not a plain rectangle: a notch at its western end pulls
 * the bounding box north, so the bbox centre lies *outside* the corridor for
 * all but the westernmost stretch. Taking it as the lane put the track just
 * north of the corridor for almost its whole length. Instead, find the band of
 * latitudes that stay inside across the full longitude extent and run down the
 * middle of that band.
 */
function laneLatitude(passage: Feature<Polygon>): number {
  const cached = laneCache.get(passage)
  if (cached !== undefined) return cached

  const [west, south, east, north] = bbox(passage)
  let bestScore = -1
  let bestLats: number[] = []

  for (let i = 1; i < LAT_STEPS; i++) {
    const lat = south + ((north - south) * i) / LAT_STEPS
    let inside = 0
    for (let j = 0; j <= LON_STEPS; j++) {
      const lon = west + ((east - west) * j) / LON_STEPS
      if (booleanPointInPolygon([lon, lat], passage)) inside += 1
    }
    if (inside > bestScore) {
      bestScore = inside
      bestLats = []
    }
    if (inside === bestScore) bestLats.push(lat)
  }

  // Middle of the widest band, so the track runs down the centre of the
  // corridor rather than scraping either edge.
  const lane = bestLats.length ? bestLats[Math.floor(bestLats.length / 2)] : (south + north) / 2
  laneCache.set(passage, lane)
  return lane
}

/**
 * Builds the track a vessel follows to its assigned spot.
 *
 * The notice sets aside a Passage Way as the transit corridor, so an inbound
 * vessel joins it at the end nearest to where it was waiting, runs along the
 * centreline, and only then turns off towards its spot — rather than cutting
 * straight across the occupied anchorages.
 */
export function buildRoute(
  from: Position,
  to: Position,
  passage: Feature<Polygon> | null,
): Position[] {
  if (!passage) return [from, to]

  const [west, , east] = bbox(passage)
  const laneLat = laneLatitude(passage)

  // Join at whichever end of the corridor the vessel is already closest to.
  const joinLon = Math.min(Math.max(from[0], west), east)
  const leaveLon = Math.min(Math.max(to[0], west), east)

  const path: Position[] = [from, [joinLon, laneLat], [leaveLon, laneLat], to]

  // Drop any waypoint that repeats the one before it.
  return path.filter(
    (point, i) => i === 0 || point[0] !== path[i - 1][0] || point[1] !== path[i - 1][1],
  )
}
