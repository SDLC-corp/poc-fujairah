/**
 * Generates public/data/vessels.json: 40 vessels lying in each of the 12
 * declared anchorage areas, plus a few transiting the Restricted Area so the
 * incursion alert has something to report.
 *
 * Deterministic — a seeded PRNG, so regenerating gives the same fleet.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { bbox, booleanPointInPolygon, distance } from '@turf/turf'

/** Upper bound per area; the real count is whatever fits without circles touching. */
const MAX_PER_AREA = 40
/**
 * Share of the grid actually taken. A completely full anchorage leaves nothing
 * to assign, so the sample fleet leaves realistic vacancies.
 */
const FILL_RATE = 0.62
/** Must match the app defaults in analysisSlice — swing radius = LOA x factor + margin. */
const SWING_FACTOR = 2
const SAFETY_MARGIN_M = 10
/** Demo clock the sample screens are written against. */
const NOW = Date.UTC(2026, 7, 3, 9, 15)
const HOUR = 3600_000

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Vessel mix per area, following what each area is designated for. Types are the
 * AIS categories from the supplied colour palette.
 */
const PROFILES = {
  A: { types: ['bulkcarrier', 'container', 'generalcargo', 'carcarrier'], size: [110, 290] },
  BN: { types: ['chemicaltanker', 'bulkcarrier', 'container'], size: [120, 300] },
  BS: { types: ['chemicaltanker', 'bulkcarrier', 'generalcargo', 'barge'], size: [110, 290] },
  C: { types: ['generalcargo', 'crewboat', 'divingsupport', 'dredger', 'cableship'], size: [60, 200] },
  D: { types: ['chemicaltanker', 'lngcarrier'], size: [150, 290] },
  G: { types: ['lngcarrier'], size: [180, 300] },
  N: { types: ['landingcraft', 'heavyliftvsl'], size: [90, 200] },
  S: { types: ['chemicaltanker'], size: [200, 330] },
  T: { types: ['chemicaltanker', 'lngcarrier'], size: [180, 330] },
  VN: { types: ['container', 'chemicaltanker'], size: [301, 399] },
  VS: { types: ['container', 'bulkcarrier'], size: [301, 399] },
  W: { types: ['container', 'bulkcarrier', 'generalcargo', 'livestockcarrier'], size: [100, 280] },
}

const FIRST = [
  'Gulf', 'Desert', 'Ocean', 'Silver', 'Coral', 'Hormuz', 'Arabian', 'Pearl', 'Falcon', 'Sea',
  'Emirates', 'Fujairah', 'Khor', 'Dana', 'Aurora', 'Meridian', 'Atlas', 'Orion', 'Zenith',
  'Horizon', 'Sapphire', 'Amber', 'Marlin', 'Osprey', 'Trident', 'Nautilus', 'Solstice', 'Cedar',
  'Jasmine', 'Oryx', 'Falconer', 'Marina', 'Crescent', 'Nova', 'Vega', 'Lyra', 'Rigel', 'Mistral',
  'Levant', 'Monsoon',
]
const SECOND = [
  'Star', 'Trader', 'Spirit', 'Pioneer', 'Voyager', 'Endeavour', 'Harmony', 'Venture', 'Glory',
  'Wave', 'Bay', 'Dawn', 'Breeze', 'Crown', 'Legacy', 'Explorer', 'Ranger', 'Sentinel', 'Ambition',
  'Progress',
]
const FLAGS = ['PA', 'LR', 'MH', 'SG', 'AE', 'MT', 'IN', 'BS', 'CY', 'HK']

const TANKERISH = ['chemicaltanker', 'lngcarrier']
const SMALL_CRAFT = ['crewboat', 'divingsupport', 'landingcraft', 'barge']
const PREFIX = (type) => (TANKERISH.includes(type) ? 'MT' : type === 'crewboat' ? 'CB' : 'MV')
/** Beam roughly follows length; small craft are proportionally wider. */
const beamFor = (type, loa) =>
  SMALL_CRAFT.includes(type) ? Math.max(8, Math.round(loa / 3.5)) : Math.max(11, Math.round(loa / 6.2))
const draftFor = (loa) => Number((loa / 19 + 2).toFixed(1))

const anchorages = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const areas = anchorages.features.filter((f) => f.geometry.type === 'Polygon')

const features = []
let n = 0

for (const areaFeature of areas) {
  const { code, category } = areaFeature.properties
  const profile = PROFILES[code]
  if (category !== 'anchorage' || !profile) continue

  const rand = mulberry32(code.split('').reduce((a, c) => a + c.charCodeAt(0), 7) * 977)
  const [west, south, east, north] = bbox(areaFeature)

  // Space vessels on a grid wide enough that the largest swing circle in this
  // area cannot touch its neighbour: pitch = 2 x radius, plus a little slack.
  const maxRadiusM = profile.size[1] * SWING_FACTOR + SAFETY_MARGIN_M
  const pitchM = maxRadiusM * 2 * 1.03
  const midLat = (south + north) / 2
  const stepLon = pitchM / (111320 * Math.cos((midLat * Math.PI) / 180))
  // Hexagonal packing: rows sit sqrt(3)/2 apart and alternate rows are offset by
  // half a pitch, so neighbours stay a full pitch apart while ~15% more fit.
  const stepLat = (pitchM * 0.866) / 111320

  const placed = []
  const rows = Math.max(1, Math.floor((north - south) / stepLat))
  const cols = Math.max(1, Math.floor((east - west) / stepLon))
  const originLat = south + (north - south - (rows - 1) * stepLat) / 2
  const originLon = west + (east - west - (cols - 1) * stepLon) / 2

  for (let r = 0; r < rows && placed.length < MAX_PER_AREA; r++) {
    const rowOffset = r % 2 === 1 ? stepLon / 2 : 0
    for (let c = 0; c < cols && placed.length < MAX_PER_AREA; c++) {
      const lon = originLon + c * stepLon + rowOffset
      if (lon > east) continue
      const point = [Number(lon.toFixed(6)), Number((originLat + r * stepLat).toFixed(6))]
      // The grid is laid over the bounding box, so L-shaped areas drop points.
      if (!booleanPointInPolygon(point, areaFeature)) continue
      if (rand() > FILL_RATE) continue
      placed.push(point)
    }
  }

  placed.forEach((coordinates) => {
    const type = profile.types[Math.floor(rand() * profile.types.length)]
    const [minLoa, maxLoa] = profile.size
    const lengthM = Math.round(minLoa + rand() * (maxLoa - minLoa))
    // Most vessels at an anchorage are brought up; a few are still manoeuvring.
    const underway = rand() < 0.12
    // Arrival in the last five days, departure in the next four — the feed would
    // carry these; they drive dwell time and departure planning.
    const ata = new Date(NOW - Math.round((2 + rand() * 118) * HOUR)).toISOString()
    const etd = new Date(NOW + Math.round((3 + rand() * 93) * HOUR)).toISOString()
    // Areas are gridded independently, so two vessels either side of a shared
    // border can still foul each other. Drop the later one.
    const radiusM = lengthM * SWING_FACTOR + SAFETY_MARGIN_M
    const fouls = features.some((f) => {
      const gap = distance(coordinates, f.geometry.coordinates, { units: 'kilometers' }) * 1000
      return gap < radiusM + f.properties.lengthM * SWING_FACTOR + SAFETY_MARGIN_M
    })
    if (fouls) return

    n += 1
    features.push({
      type: 'Feature',
      id: `V-${String(n).padStart(4, '0')}`,
      properties: {
        id: `V-${String(n).padStart(4, '0')}`,
        // Independent strides, so the 40 x 20 pool yields 800 distinct names
        // before any repeat rather than cycling every 40 vessels.
        name: `${PREFIX(type)} ${FIRST[n % FIRST.length]} ${
          SECOND[Math.floor(n / FIRST.length) % SECOND.length]
        }`,
        imo: String(9100000 + ((n * 8017) % 899999)),
        type,
        flag: FLAGS[Math.floor(rand() * FLAGS.length)],
        lengthM,
        beamM: beamFor(type, lengthM),
        draftM: draftFor(lengthM),
        speedKn: underway ? Number((0.5 + rand() * 6).toFixed(1)) : 0,
        headingDeg: Math.round(rand() * 359),
        status: underway ? 'underway' : 'anchored',
        area: code,
        ata,
        etd,
      },
      geometry: { type: 'Point', coordinates },
    })
  })
}

// Vessels waiting outside the declared areas for a spot to be assigned. These
// are what the assignment screen works on, so they sit clear of every polygon.
const AWAITING = [
  ['MT Arabian Dawn', 'chemicaltanker', 244, 'PA', 15, '2026-08-03T15:40:00Z'],
  ['MV Indus Trader', 'container', 198, 'SG', 21, '2026-08-03T19:05:00Z'],
  ['MV Sea Harrier', 'bulkcarrier', 172, 'MH', 27, '2026-08-04T02:30:00Z'],
  ['MT Gas Sentinel', 'lngcarrier', 288, 'MT', 33, '2026-08-04T06:10:00Z'],
  ['MV Atlas Pioneer', 'container', 336, 'LR', 39, '2026-08-04T11:25:00Z'],
]
const WAITING_POSITIONS = [
  [56.606, 25.242],
  [56.621, 25.191],
  [56.598, 25.302],
  [56.612, 25.145],
  [56.634, 25.268],
]
AWAITING.forEach(([name, type, lengthM, flag, etaHours, eta], i) => {
  n += 1
  features.push({
    type: 'Feature',
    id: `V-${String(n).padStart(4, '0')}`,
    properties: {
      id: `V-${String(n).padStart(4, '0')}`,
      name,
      imo: String(9800000 + i * 211),
      type,
      flag,
      lengthM,
      beamM: beamFor(type, lengthM),
      draftM: draftFor(lengthM),
      speedKn: Number((6 + i * 0.7).toFixed(1)),
      headingDeg: 250 + i * 7,
      status: 'awaiting',
      area: null,
      ata: null,
      etd: null,
      eta,
      etaHours,
    },
    geometry: { type: 'Point', coordinates: WAITING_POSITIONS[i] },
  })
})

// A few transiting the Restricted Area, where the notice prohibits steaming —
// without these the incursion alert has nothing to show.
const restricted = areas.find((f) => f.properties.category === 'restricted')
const TRANSITS = [
  [56.402, 25.24],
  [56.418, 25.2],
  [56.39, 25.28],
]
TRANSITS.forEach((coordinates, i) => {
  if (restricted && !booleanPointInPolygon(coordinates, restricted)) {
    throw new Error(`transit ${i} is not inside the Restricted Area`)
  }
  n += 1
  features.push({
    type: 'Feature',
    id: `V-${String(n).padStart(4, '0')}`,
    properties: {
      id: `V-${String(n).padStart(4, '0')}`,
      name: `MT ${['Nadir', 'Kestrel', 'Tramontane'][i]} ${['Trader', 'Spirit', 'Wave'][i]}`,
      imo: String(9700000 + i * 137),
      type: 'chemicaltanker',
      flag: ['AE', 'MT', 'PA'][i],
      lengthM: [183, 210, 168][i],
      beamM: [32, 34, 28][i],
      draftM: [10.8, 12.1, 9.4][i],
      speedKn: [4.6, 3.2, 5.1][i],
      headingDeg: [310, 285, 20][i],
      status: 'underway',
      area: 'RA',
      ata: new Date(NOW - 6 * HOUR).toISOString(),
      etd: new Date(NOW + 9 * HOUR).toISOString(),
    },
    geometry: { type: 'Point', coordinates },
  })
})

// One feature per line keeps the file diff-able without ballooning it.
const body = features.map((f) => `    ${JSON.stringify(f)}`).join(',\n')
writeFileSync(
  process.argv[3],
  `{\n  "type": "FeatureCollection",\n  "name": "vessels",\n  "features": [\n${body}\n  ]\n}\n`,
)

const byArea = {}
for (const f of features) byArea[f.properties.area] = (byArea[f.properties.area] ?? 0) + 1
console.log('total vessels:', features.length)
console.log(byArea)
