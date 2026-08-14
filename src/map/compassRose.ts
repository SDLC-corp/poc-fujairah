/**
 * A chart compass rose, built as geometry rather than fetched: one ring
 * graduated 000-359, true north marked, the magnetic north the compass would
 * actually show dashed beside it, and the variation written underneath — the
 * way the rose on the FAA sheet carries it.
 *
 * It is drawn in SVG over the map rather than as map layers. A rose laid on the
 * water plane is only the right size at one zoom, leaves the pane at every
 * other, and under the pitched camera projects to a squashed ellipse. None of
 * that is what a rose is for: it is an instrument in the corner of the sheet,
 * so it is drawn in the corner of the pane and only its rotation comes from the
 * map.
 *
 * Variation is the only external input, and it comes from the World Magnetic
 * Model rather than from the chart, so it stays current. WMM-2025 for
 * 25.23N 056.53E gives 2.131 deg E drifting +0.0052 deg a year, which the
 * annual term below carries forward from the epoch. Uncertainty is +/-0.30 deg,
 * so the rose is drawn to the minute and no finer.
 * https://www.ngdc.noaa.gov/geomag/calculators/magcalc.shtml
 */
const WMM_EPOCH_YEAR = 2026.61
const WMM_DECLINATION_DEG = 2.131
const WMM_ANNUAL_CHANGE_DEG = 0.0052

/** The rose is printed in black on the sheet, and drawn in black here. */
export const COMPASS_INK = '#111111'

/**
 * Outer radius in SVG units, and the room outside it the numbers need.
 *
 * These are drawing units, not pixels — the viewBox scales to whatever width
 * the CSS gives the rose, so this is the *layout* budget and the stylesheet
 * decides how big it ends up on screen. What is fixed here is the ratio: the
 * numbers stand outside the ring every ten degrees, so 36 of them share a
 * circumference of 2*pi*1.12*R and each needs about 15 units clear. That holds
 * at any final size; what does not survive shrinking is legibility, so the
 * numbers are the thing to check before making the rose much smaller than the
 * stylesheet already does.
 */
export const ROSE_RADIUS = 84
export const ROSE_PADDING = 14

/** Radii as a fraction of the ring, following the chart's proportions. */
const R_RING = 1
const R_TICK_TEN = 0.915
const R_TICK_FIVE = 0.945
const R_TICK_ONE = 0.968
const R_LABELS = 1.12
/**
 * The north pointer: a needle standing inside the ring at 000, split down the
 * meridian with one half solid and one half open — the way a compass needle is
 * drawn, and the setting that survives both ways this got it wrong. The sheet's
 * fine open leaf vanished at 213 px and read as a stray tick; a solid spearhead
 * wide enough to fix that put a black blot on the chart. Half the ink reads as
 * an arrow at a glance without either.
 */
const R_POINTER_TIP = 0.965
const R_POINTER_WAIST = 0.78
const R_POINTER_FOOT = 0.62
const POINTER_HALF_WIDTH = 0.055

/** Declination in degrees east, for a given date. */
export function declinationDeg(date: Date): number {
  const year = date.getUTCFullYear() + date.getUTCMonth() / 12
  return WMM_DECLINATION_DEG + (year - WMM_EPOCH_YEAR) * WMM_ANNUAL_CHANGE_DEG
}

/** 2.131 -> "2°08′E", the form a chart prints. */
export function formatVariation(deg: number): string {
  const hemisphere = deg >= 0 ? 'E' : 'W'
  const abs = Math.abs(deg)
  const whole = Math.floor(abs)
  const minutes = Math.round((abs - whole) * 60)
  // 59.7' rounds to 60' — carry it rather than printing 2°60′.
  const carry = minutes === 60
  return `${carry ? whole + 1 : whole}°${String(carry ? 0 : minutes).padStart(2, '0')}′${hemisphere}`
}

export interface RoseLabel {
  x: number
  y: number
  text: string
  /** Degrees clockwise, so the number stands radially on the ring. */
  rotate: number
}

export interface RoseGeometry {
  radius: number
  /** Half the side of the square viewBox, centred on the rose. */
  extent: number
  /**
   * The graduation, as three path strings so each tier can carry its own
   * weight. A path rather than 360 line elements: the ring is redrawn every
   * frame the map is turned, and one node reconciles where 360 do not.
   */
  ticksOne: string
  ticksFive: string
  ticksTen: string
  labels: RoseLabel[]
  /** The needle at true north, as two polygon point lists: solid half, open half. */
  pointerSolid: string
  pointerOpen: string
  /** End of the dashed magnetic north line. */
  magneticNorth: { x: number; y: number }
  variation: number
  /**
   * "2°08′E 2026" — variation and the year it was worked for, the way the sheet
   * writes it up the meridian. Kept short: the run between the centre and the
   * foot of the north pointer is only about 53 units.
   */
  variationText: string
}

/**
 * Builds the whole rose in SVG space: x right, y down, bearings clockwise from
 * up. Nothing here depends on the map, so it is computed once per date.
 */
export function buildCompassRose(date = new Date(), radius = ROSE_RADIUS): RoseGeometry {
  const variation = declinationDeg(date)
  const at = (fraction: number, bearing: number) => {
    const rad = (bearing * Math.PI) / 180
    return { x: radius * fraction * Math.sin(rad), y: -radius * fraction * Math.cos(rad) }
  }
  const seg = (bearing: number, inner: number) => {
    const a = at(R_RING, bearing)
    const b = at(inner, bearing)
    return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}L${b.x.toFixed(2)} ${b.y.toFixed(2)}`
  }

  // Graduated every degree, as the sheet is: the single degrees are a comb, the
  // fives break it into hands and the tens carry the numbers.
  const one: string[] = []
  const five: string[] = []
  const ten: string[] = []
  for (let d = 0; d < 360; d++) {
    if (d % 10 === 0) ten.push(seg(d, R_TICK_TEN))
    else if (d % 5 === 0) five.push(seg(d, R_TICK_FIVE))
    else one.push(seg(d, R_TICK_ONE))
  }

  const labels: RoseLabel[] = []
  for (let d = 0; d < 360; d += 10) {
    const p = at(R_LABELS, d)
    // Radial numbers, as on the chart — but flipped through the lower half so
    // they never read upside down.
    labels.push({ x: p.x, y: p.y, text: String(d).padStart(3, '0'), rotate: d > 180 ? d - 180 : d })
  }

  const half = (side: 1 | -1) =>
    [
      at(R_POINTER_TIP, 0),
      { x: side * POINTER_HALF_WIDTH * radius, y: -R_POINTER_WAIST * radius },
      at(R_POINTER_FOOT, 0),
    ]
      .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ')

  return {
    radius,
    extent: radius * R_LABELS + ROSE_PADDING,
    ticksOne: one.join(''),
    ticksFive: five.join(''),
    ticksTen: ten.join(''),
    labels,
    pointerSolid: half(1),
    pointerOpen: half(-1),
    // Variation east means the compass points east of true, so magnetic north
    // sits at true 002.1 and true bearing = magnetic + variation throughout.
    magneticNorth: at(R_TICK_TEN, variation),
    variation,
    variationText: `${formatVariation(variation)} ${date.getUTCFullYear()}`,
  }
}
