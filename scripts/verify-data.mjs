/**
 * Sanity-checks the static datasets with the same Turf operations the UI uses.
 * Run with: node scripts/verify-data.mjs
 */
import { readFile } from 'node:fs/promises'
import {
  area,
  bbox,
  booleanPointInPolygon,
  booleanWithin,
  circle,
  destination,
  distance,
} from '@turf/turf'

/** Must match the app defaults in analysisSlice. */
const SWING_FACTOR = 2
const SAFETY_MARGIN_M = 10

const load = async (name) =>
  JSON.parse(await readFile(new URL(`../public/data/${name}.json`, import.meta.url), 'utf8'))

const [anchorages, vessels] = await Promise.all(['anchorages', 'vessels'].map(load))

const areas = anchorages.features.filter((f) => f.geometry.type === 'Polygon')
const berths = anchorages.features.filter((f) => f.properties.category === 'anchor-berth')
const buoys = anchorages.features.filter((f) => f.properties.category === 'buoy')

console.log('Fujairah Anchorage Area — Notice to Mariners No. 346')
console.log(`  ${areas.length} polygons, ${berths.length} anchor berths, ${buoys.length} buoys\n`)

for (const a of areas) {
  const km2 = area(a) / 1e6
  console.log(`  ${a.properties.code.padEnd(3)} ${a.properties.name.padEnd(26)} ${km2.toFixed(1)} km²`)
}

console.log('\nPoint-in-polygon — vessel containment:')
if (vessels.features.length === 0) {
  console.log('  no vessels loaded (public/data/vessels.json is an empty placeholder)')
} else {
  for (const vessel of vessels.features) {
    const inside = areas.filter((a) => booleanPointInPolygon(vessel, a))
    const nearest = berths
      .map((b) => ({ b, d: distance(vessel, b, { units: 'kilometers' }) * 1000 }))
      .sort((x, y) => x.d - y.d)[0]
    console.log(
      `  ${vessel.properties.name.padEnd(20)} ${
        inside.map((a) => a.properties.name).join(', ') || 'outside declared areas'
      }${nearest ? ` | nearest ${nearest.b.properties.name} @ ${nearest.d.toFixed(0)} m` : ''}`,
    )
  }
}

/* ------------------------------------------------------------------ *
 * Swing circles: no vessel may foul another, and none may swing out of
 * the area it is lying in. Mirrors selectors.ts — the circle turns about
 * the anchor, which sits a cable ahead of the ship along its heading.
 * ------------------------------------------------------------------ */

console.log('\nSwing circles:')

const swings = vessels.features.map((vessel) => {
  const { lengthM, headingDeg, name, status } = vessel.properties
  const radiusM = lengthM * SWING_FACTOR + SAFETY_MARGIN_M
  const cableM = Math.max(0, lengthM * (SWING_FACTOR - 1))
  const anchor = cableM
    ? destination(vessel, cableM / 1000, headingDeg, { units: 'kilometers' }).geometry.coordinates
    : vessel.geometry.coordinates
  return { name, status, radiusM, anchor }
})

const fouls = []
for (let i = 0; i < swings.length; i++) {
  for (let j = i + 1; j < swings.length; j++) {
    const a = swings[i]
    const b = swings[j]
    const gap = distance(a.anchor, b.anchor, { units: 'kilometers' }) * 1000
    const need = a.radiusM + b.radiusM
    if (gap < need) fouls.push({ a, b, short: need - gap })
  }
}

// Vessels awaiting a spot lie outside the declared areas on purpose, and the
// transits are steaming through the Restricted Area to trip the incursion
// alert — neither is expected to be contained.
const breaches = []
for (const s of swings) {
  if (s.status === 'awaiting') continue
  const host = areas
    .filter((a) => a.properties.category === 'anchorage')
    .find((a) => booleanPointInPolygon(s.anchor, a))
  if (!host) continue
  const ring = circle(s.anchor, s.radiusM / 1000, { units: 'kilometers', steps: 64 })
  if (!booleanWithin(ring, host)) breaches.push({ s, host })
}

console.log(`  ${swings.length} circles checked, radius = LOA x ${SWING_FACTOR} + ${SAFETY_MARGIN_M} m`)
console.log(`  overlapping pairs:    ${fouls.length}`)
for (const f of fouls) {
  console.log(`    ! ${f.a.name} x ${f.b.name} — ${f.short.toFixed(0)} m short of clear`)
}
console.log(`  outside their area:   ${breaches.length}`)
for (const b of breaches) {
  console.log(`    ! ${b.s.name} swings out of ${b.host.properties.name}`)
}

if (fouls.length || breaches.length) {
  console.error('\nFAILED — regenerate with: npm run gen:vessels')
  process.exitCode = 1
} else {
  console.log('  OK — every circle is clear and inside its area.')
}

/* ------------------------------------------------------------------ *
 * Free spots: the same rules again, for the water the app offers as
 * available. Mirrors selectFreeSpots — a spot the map draws must be one
 * checkSpotAt would accept, or the operator is offered a berth the app
 * would refuse the moment they dragged a spot to it.
 * ------------------------------------------------------------------ */

console.log('\nFree spots:')

const DEFAULT_LOA_M = 200
const anchorageAreas = areas.filter((a) => a.properties.category === 'anchorage')
const restrictedAreas = areas.filter((a) => a.properties.category === 'restricted')
const fleet = swings.filter((s) => s.status !== 'awaiting')

const spots = []
for (const areaFeature of anchorageAreas) {
  const here = vessels.features.filter((v) => booleanPointInPolygon(v, areaFeature))
  const referenceLoa = here.length
    ? Math.max(...here.map((v) => v.properties.lengthM))
    : DEFAULT_LOA_M
  const radiusM = referenceLoa * SWING_FACTOR + SAFETY_MARGIN_M
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
      const lon = originLon + c * stepLon + rowOffset
      if (lon > east) continue
      const centre = [lon, originLat + r * stepLat]
      if (!booleanPointInPolygon(centre, areaFeature)) continue
      if (restrictedAreas.some((ra) => booleanPointInPolygon(centre, ra))) continue
      if (
        fleet.some(
          (v) => distance(centre, v.anchor, { units: 'kilometers' }) * 1000 < radiusM + v.radiusM,
        )
      ) {
        continue
      }
      if (
        spots.some(
          (s) => distance(centre, s.centre, { units: 'kilometers' }) * 1000 < radiusM + s.radiusM,
        )
      ) {
        continue
      }
      const ring = circle(centre, radiusM / 1000, { units: 'kilometers', steps: 28 })
      if (!booleanWithin(ring, areaFeature)) continue
      spots.push({ id: `FS-${areaFeature.properties.code}-${r}-${c}`, areaFeature, centre, radiusM })
    }
  }
}

const spotProblems = []
for (const s of spots) {
  const ring = circle(s.centre, s.radiusM / 1000, { units: 'kilometers', steps: 64 })
  if (!booleanWithin(ring, s.areaFeature)) {
    spotProblems.push(`${s.id} swings out of ${s.areaFeature.properties.name}`)
  }
  if (restrictedAreas.some((ra) => booleanPointInPolygon(s.centre, ra))) {
    spotProblems.push(`${s.id} lies in the Restricted Area — anchoring prohibited`)
  }
  for (const v of fleet) {
    const need = s.radiusM + v.radiusM
    const gap = distance(s.centre, v.anchor, { units: 'kilometers' }) * 1000
    if (gap < need) spotProblems.push(`${s.id} overlaps ${v.name} — ${(need - gap).toFixed(0)} m short`)
  }
}
for (let i = 0; i < spots.length; i++) {
  for (let j = i + 1; j < spots.length; j++) {
    const need = spots[i].radiusM + spots[j].radiusM
    if (distance(spots[i].centre, spots[j].centre, { units: 'kilometers' }) * 1000 < need) {
      spotProblems.push(`${spots[i].id} overlaps ${spots[j].id}`)
    }
  }
}

const spotsByArea = {}
for (const s of spots) {
  const code = s.areaFeature.properties.code
  spotsByArea[code] = (spotsByArea[code] ?? 0) + 1
}
console.log(`  ${spots.length} spots offered: ${JSON.stringify(spotsByArea)}`)
console.log(`  conflicts: ${spotProblems.length}`)
for (const p of spotProblems.slice(0, 20)) console.log(`    ! ${p}`)
if (spotProblems.length > 20) console.log(`    … ${spotProblems.length - 20} more`)

if (spotProblems.length) {
  console.error('\nFAILED — selectFreeSpots is offering water it should not')
  process.exitCode = 1
} else {
  console.log('  OK — every offered spot is clear, unrestricted and inside its area.')
}
