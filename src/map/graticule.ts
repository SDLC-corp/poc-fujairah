import type { Feature, FeatureCollection, LineString, MultiLineString } from 'geojson'

/**
 * The chart graticule: meridians and parallels graduated in minutes, the way
 * the border scale on the sheet is graduated.
 *
 * What it is for. The graduation is how a position is read off the chart or
 * plotted onto it — but the latitude scale is also the *distance* scale, and
 * that is the part worth keeping straight. One minute of latitude is one
 * nautical mile by definition, everywhere, so a distance is spanned against the
 * parallels. One minute of longitude is not: at Fujairah's 25.2N it is 0.905 NM,
 * and measuring against the meridians under-reads by about a tenth.
 *
 * Built as geometry rather than fetched, like the rose. Note that the ticks are
 * sized in minutes rather than in pixels on purpose: the graduation they sit on
 * is also in minutes, so tick and spacing scale together and the ruler looks
 * proportionally the same at every zoom, with nothing to recompute on a move.
 */

/** Generous enough to cover the port, the FAA and the approaches, with margin. */
const EXTENT: [number, number, number, number] = [56.2, 24.95, 56.9, 25.5]

/** Drawn lines every 5', graduated at 1' and subdivided at 0.2'. */
const LINE_INTERVAL_MIN = 5
const MAJOR_TICK_MIN = 1
const MINOR_TICK_MIN = 0.2
/** Tick lengths, also in minutes — about an eighth of the 1' graduation. */
const MAJOR_TICK_LEN_MIN = 0.13
const MINOR_TICK_LEN_MIN = 0.06

export interface GraticuleProps {
  id: string
  kind: 'line' | 'tick'
  axis: 'meridian' | 'parallel'
  /** Whole-minute graduations are drawn heavier than the tenths. */
  major: boolean
  /** "56°30′E" / "25°10′N" — empty on the ticks. */
  label: string
}

type GraticuleFeature = Feature<LineString | MultiLineString, GraticuleProps>

/** Whole minutes from `fromDeg` to `toDeg`, stepping in minutes. */
function minutesBetween(fromDeg: number, toDeg: number, stepMin: number): number[] {
  const first = Math.ceil((fromDeg * 60) / stepMin) * stepMin
  const last = Math.floor((toDeg * 60) / stepMin) * stepMin
  const out: number[] = []
  // Counted rather than accumulated: stepping 0.2 at a time drifts off the
  // whole minutes, and the whole minutes are where the heavy ticks go.
  const steps = Math.round((last - first) / stepMin)
  for (let i = 0; i <= steps; i++) out.push(first + i * stepMin)
  return out
}

/** 3390 -> "56°30′E". Charts write the degrees and the minutes, nothing finer. */
function formatMinutes(totalMin: number, axis: 'meridian' | 'parallel'): string {
  const hemisphere = axis === 'meridian' ? (totalMin >= 0 ? 'E' : 'W') : totalMin >= 0 ? 'N' : 'S'
  const abs = Math.abs(totalMin)
  const degrees = Math.floor(abs / 60)
  const minutes = Math.round(abs - degrees * 60)
  return `${degrees}°${String(minutes).padStart(2, '0')}′${hemisphere}`
}

export function buildGraticule(extent = EXTENT): FeatureCollection<
  LineString | MultiLineString,
  GraticuleProps
> {
  const [west, south, east, north] = extent
  const features: GraticuleFeature[] = []

  const props = (
    id: string,
    kind: GraticuleProps['kind'],
    axis: GraticuleProps['axis'],
    major: boolean,
    label = '',
  ): GraticuleProps => ({ id, kind, axis, major, label })

  /**
   * A tick crosses its line square-on, so the ticks on a meridian run east-west
   * and have to be widened by 1/cos(lat) — a degree of longitude is shorter
   * than a degree of latitude, and without the correction the meridians would
   * carry visibly stubbier graduations than the parallels.
   */
  const tickBundle = (
    axis: GraticuleProps['axis'],
    valueMin: number,
    fromDeg: number,
    toDeg: number,
    stepMin: number,
    lengthMin: number,
    major: boolean,
  ) => {
    const value = valueMin / 60
    const coordinates: [number, number][][] = []
    for (const atMin of minutesBetween(fromDeg, toDeg, stepMin)) {
      // The whole minutes are drawn by the major pass; skip them here so the
      // heavy tick is not sitting under a light one.
      if (!major && Math.abs(atMin / MAJOR_TICK_MIN - Math.round(atMin / MAJOR_TICK_MIN)) < 1e-6) {
        continue
      }
      const at = atMin / 60
      if (axis === 'meridian') {
        const half = lengthMin / 60 / 2 / Math.cos((at * Math.PI) / 180)
        coordinates.push([
          [value - half, at],
          [value + half, at],
        ])
      } else {
        const half = lengthMin / 60 / 2
        coordinates.push([
          [at, value - half],
          [at, value + half],
        ])
      }
    }
    if (!coordinates.length) return
    features.push({
      type: 'Feature',
      properties: props(`grat-${axis}-${valueMin}-${major ? 'maj' : 'min'}`, 'tick', axis, major),
      geometry: { type: 'MultiLineString', coordinates },
    })
  }

  for (const valueMin of minutesBetween(west, east, LINE_INTERVAL_MIN)) {
    const lng = valueMin / 60
    features.push({
      type: 'Feature',
      properties: props(
        `grat-meridian-${valueMin}`,
        'line',
        'meridian',
        true,
        formatMinutes(valueMin, 'meridian'),
      ),
      geometry: {
        type: 'LineString',
        coordinates: [
          [lng, south],
          [lng, north],
        ],
      },
    })
    tickBundle('meridian', valueMin, south, north, MINOR_TICK_MIN, MINOR_TICK_LEN_MIN, false)
    tickBundle('meridian', valueMin, south, north, MAJOR_TICK_MIN, MAJOR_TICK_LEN_MIN, true)
  }

  for (const valueMin of minutesBetween(south, north, LINE_INTERVAL_MIN)) {
    const lat = valueMin / 60
    features.push({
      type: 'Feature',
      properties: props(
        `grat-parallel-${valueMin}`,
        'line',
        'parallel',
        true,
        formatMinutes(valueMin, 'parallel'),
      ),
      geometry: {
        type: 'LineString',
        coordinates: [
          [west, lat],
          [east, lat],
        ],
      },
    })
    tickBundle('parallel', valueMin, west, east, MINOR_TICK_MIN, MINOR_TICK_LEN_MIN, false)
    tickBundle('parallel', valueMin, west, east, MAJOR_TICK_MIN, MAJOR_TICK_LEN_MIN, true)
  }

  return { type: 'FeatureCollection', features }
}
