import { createSelector } from '@reduxjs/toolkit'
import { area as turfArea, circle as turfCircle, length as turfLength, lineString, polygon as turfPolygon } from '@turf/turf'
import type { Feature, FeatureCollection } from 'geojson'
import type { RootState } from '../../app/store'
import type { IncidentGeometry } from '../../types/incident'

const selectDraw = (s: RootState) => s.draw

/** Five decimals — about a metre, finer than a hand-drawn boundary is known to. */
const round = (n: number) => Math.round(n * 1e5) / 1e5

/**
 * The ring the draft describes, closed, or null when there is not one yet.
 *
 * A polygon needs three distinct corners before it encloses anything; a circle
 * needs a centre. Below that there is a line or a point on the chart but no
 * area, and returning a half-ring for the area figures to divide by would put
 * `0 km²` beside two corners as though it meant something.
 */
export const selectDraftRing = createSelector([selectDraw], (d): [number, number][] | null => {
  if (d.shape === 'circle') {
    if (!d.points.length) return null
    const ring = turfCircle(d.points[0], d.radiusM / 1000, { units: 'kilometers', steps: 64 })
    return ring.geometry.coordinates[0] as [number, number][]
  }
  if (d.points.length < 3) return null
  return [...d.points, d.points[0]]
})

/**
 * What the draft is worth, in the figures the panel reports.
 *
 * Perimeter is measured on the closed ring, so it includes the leg back to the
 * first corner — which is what a perimeter is, and what an operator checking a
 * boundary against a chart will measure.
 */
export interface DraftMetrics {
  areaM2: number
  perimeterM: number
  points: number
}

export const selectDraftMetrics = createSelector(
  [selectDraw, selectDraftRing],
  (d, ring): DraftMetrics | null => {
    if (!ring) return null
    return {
      areaM2: turfArea(turfPolygon([ring])),
      perimeterM: turfLength(lineString(ring), { units: 'kilometers' }) * 1000,
      // The closing repeat is not a point anybody placed.
      points: d.shape === 'circle' ? 1 : d.points.length,
    }
  },
)

/**
 * The draft as the geometry a record would store.
 *
 * A circle keeps its centre and radius — the authored figures — rather than the
 * 64-gon drawn from them. Storing the ring instead would be storing a picture
 * of the shape in place of the shape.
 */
export const selectDraftGeometry = createSelector(
  [selectDraw, selectDraftRing],
  (d, ring): IncidentGeometry | null => {
    if (!ring) return null
    if (d.shape === 'circle') {
      return {
        kind: 'circle',
        centre: [round(d.points[0][0]), round(d.points[0][1])],
        radiusM: d.radiusM,
      }
    }
    return {
      kind: 'polygon',
      coordinates: ring.map(([lon, lat]) => [round(lon), round(lat)] as [number, number]),
    }
  },
)

/**
 * The draft for the chart: the area, its edge, and a numbered mark per vertex.
 *
 * The rubber band is in here too — while a polygon is being drawn the edge runs
 * from the last placed corner to the cursor, and for a circle the radius
 * follows it until a second click settles it. Without that the shape only
 * appears once it is finished, and an operator placing corners is working blind.
 */
export const selectDraftGeoJson = createSelector([selectDraw], (d): FeatureCollection => {
  if (!d.active) return { type: 'FeatureCollection', features: [] }
  const features: Feature[] = []

  if (d.shape === 'circle') {
    const centre = d.points[0]
    if (centre) {
      // Before the second click the rim follows the cursor, so the operator can
      // see the water they are about to enclose rather than a number.
      const live =
        !d.radiusFixed && d.hover
          ? turfLength(lineString([centre, d.hover]), { units: 'kilometers' }) * 1000
          : d.radiusM
      const ring = turfCircle(centre, Math.max(1, live) / 1000, {
        units: 'kilometers',
        steps: 64,
      })
      features.push({ ...ring, properties: { kind: 'area' } } as Feature)
      features.push({
        type: 'Feature',
        properties: { kind: 'vertex', n: 1, label: 'C' },
        geometry: { type: 'Point', coordinates: centre },
      })
    }
    return { type: 'FeatureCollection', features }
  }

  const placed = d.points
  /**
   * The line being drawn, cursor included — but only while it is being drawn.
   *
   * Once the shape is finished the cursor is just a cursor, and an edge that
   * kept chasing it would say the ring was still open when it is not.
   */
  const trail = !d.complete && d.hover && placed.length ? [...placed, d.hover] : placed

  if (placed.length >= 3) {
    features.push({
      type: 'Feature',
      properties: { kind: 'area' },
      geometry: { type: 'Polygon', coordinates: [[...placed, placed[0]]] },
    })
  }
  if (trail.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'edge' },
      geometry: { type: 'LineString', coordinates: trail },
    })
  }
  placed.forEach((at, i) => {
    features.push({
      type: 'Feature',
      properties: { kind: 'vertex', n: i + 1, label: String(i + 1) },
      geometry: { type: 'Point', coordinates: at },
    })
  })

  return { type: 'FeatureCollection', features }
})
