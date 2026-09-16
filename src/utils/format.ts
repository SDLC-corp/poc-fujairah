/** One nautical mile, and the cable — a tenth of it — that charts subdivide by. */
export const METRES_PER_NM = 1852
const METRES_PER_CABLE = METRES_PER_NM / 10

/** 13100 -> "7.07 NM". Metres are kept for anything inside a cable. */
export function formatDistance(metres: number): string {
  // Under a cable there is no mile left to read: two decimals of a mile is 19 m
  // of resolution, which is coarser than the clearances being judged. Those are
  // worked in metres anyway, the way the swing circle and the safety margin are.
  if (metres < METRES_PER_CABLE) return `${metres.toFixed(0)} m`
  return `${(metres / METRES_PER_NM).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} NM`
}

/** The same distance in metres, for a caption under the mile figure. */
export function formatMetres(metres: number): string {
  return metres < 1000
    ? `${metres.toFixed(0)} m`
    : `${(metres / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`
}

export function formatArea(m2: number): string {
  return m2 < 10_000
    ? `${m2.toLocaleString(undefined, { maximumFractionDigits: 0 })} m²`
    : `${(m2 / 10_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`
}

/** e.g. "03 Aug 14:20" — compact enough for a dense table. */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

/** Whole minutes between two ISO timestamps, or null if either is missing. */
export function minutesBetween(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 60_000)
}

/** Whole hours between two ISO timestamps, or null if either is missing. */
export function hoursBetween(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 3600_000)
}

/** Hours from an ISO timestamp until now, or null if it is missing or unparseable. */
export function hoursSince(from?: string | null): number | null {
  return hoursBetween(from, new Date().toISOString())
}

/**
 * 152 -> "6 d 8 h".
 *
 * Days first, because an anchorage stay is counted in days — an operator
 * reading "152 h" has to divide before the figure means anything. The hours are
 * kept alongside rather than rounded away: the difference between day six and
 * day seven decides whether a vessel is over its expected departure.
 */
export function formatDuration(hours?: number | null): string {
  if (hours == null) return '—'
  if (hours < 1) return '<1 h'
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest ? `${days} d ${rest} h` : `${days} d`
}

/**
 * How long ago, read the way an operator says it: "4 min ago".
 *
 * Coarsens as it goes back — the difference between 4 and 5 minutes matters on
 * a position report, the difference between 71 and 72 hours does not.
 */
export function formatAgo(iso?: string | null): string {
  if (!iso) return 'not recorded'
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return 'not recorded'

  const mins = Math.round((Date.now() - at) / 60_000)
  if (mins < 0) return 'ahead of the clock'
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function dmm(value: number, pad: number, positive: string, negative: string): string {
  const hemisphere = value >= 0 ? positive : negative
  const abs = Math.abs(value)
  let deg = Math.floor(abs)
  let min = (abs - deg) * 60
  // Carry, so rounding never prints the impossible 25° 60.000'.
  if (min >= 59.9995) {
    deg += 1
    min = 0
  }
  return `${String(deg).padStart(pad, '0')}° ${min.toFixed(3).padStart(6, '0')}' ${hemisphere}`
}

/**
 * A position in degrees and decimal minutes, split at its comma.
 *
 * The pair is one fact, but a card narrow enough to wrap it has to lay it out
 * as two cells: broken apart deliberately it can only ever break *between*
 * latitude and longitude, where a reader expects a break, instead of in the
 * middle of a longitude where one is unreadable.
 */
export function formatLatLonParts(lat: number, lon: number): [string, string] {
  return [dmm(lat, 2, 'N', 'S'), dmm(lon, 3, 'E', 'W')]
}

/**
 * A position in degrees and decimal minutes, the way a bridge works in.
 *
 * Decimal degrees are what the console stores and what a GIS wants; nobody on
 * a ship plots in them. A position sent to a master goes out in the form he
 * can read straight onto the chart or key into the ECDIS, with longitude
 * three-figure as the convention requires.
 */
export function formatLatLon(lat: number, lon: number): string {
  return formatLatLonParts(lat, lon).join(', ')
}

/**
 * The same position in plain decimal degrees — `25.28777, 56.48794`.
 *
 * Undecorated on purpose. This is the half of a copied position that gets
 * pasted into something which parses it rather than read by anyone, and a
 * parser wants two signed numbers: `25.28777°N, 56.48794°E` is rejected by
 * Google Maps, by QGIS and by a spreadsheet cell, while the bare pair goes
 * straight into all three. South and west carry the minus sign the hemisphere
 * letter would otherwise have carried, and latitude leads, which is the order
 * every one of those targets expects — GeoJSON's lon-first order is for the
 * wire, not for a paste.
 */
export function formatLatLonDecimal(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

/**
 * Both forms on one line — `25° 17.266' N, 056° 29.276' E  (25.28777, 56.48794)`.
 *
 * What a copied or mailed position carries. Both rather than a choice, because
 * the two readers want different ones and whoever sends it cannot know which
 * they are writing to: a bridge plots degrees and minutes, and anything that
 * parses it afterwards wants the plain decimal pair.
 */
export function formatLatLonBoth(lat: number, lon: number): string {
  return `${formatLatLon(lat, lon)}  (${formatLatLonDecimal(lat, lon)})`
}
