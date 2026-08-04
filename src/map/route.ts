import { bbox } from '@turf/turf'
import type { Feature, Polygon, Position } from 'geojson'

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

  const [west, south, east, north] = bbox(passage)
  const laneLat = (south + north) / 2

  // Join at whichever end of the corridor the vessel is already closest to.
  const joinLon = Math.min(Math.max(from[0], west), east)
  const leaveLon = Math.min(Math.max(to[0], west), east)

  const path: Position[] = [from, [joinLon, laneLat], [leaveLon, laneLat], to]

  // Drop any waypoint that repeats the one before it.
  return path.filter(
    (point, i) => i === 0 || point[0] !== path[i - 1][0] || point[1] !== path[i - 1][1],
  )
}
