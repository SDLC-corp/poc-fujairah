/**
 * Generates public/data/playback.json: one day of position history for 30
 * vessels, so the playback screen replays recorded tracks rather than a shape
 * derived on the fly.
 *
 * Each vessel is picked up offshore to the east, runs in down the Passage Way
 * the way the notice intends, and comes up to an anchorage berth. A handful
 * sail instead, leaving their berth and standing out to sea.
 *
 * Deterministic — a seeded PRNG, so regenerating gives the same day.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { along, bbox, bearing, booleanPointInPolygon, destination, length as turfLength, lineString } from '@turf/turf'

const DAY = '2026-08-03'
/** The replay window: 12:00–18:00 UTC on day one. */
const FROM = Date.UTC(2026, 7, 3, 12, 0)
const TO = Date.UTC(2026, 7, 3, 18, 0)
const INTERVAL_MIN = 5
const VESSEL_COUNT = 30
/** Distance offshore each inbound vessel is picked up, in km. */
const APPROACH_KM = 34
const SEA_SPEED_KN = 12.5

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rand = mulberry32(20260803)
const pick = (list) => list[Math.floor(rand() * list.length)]
const between = (lo, hi) => lo + rand() * (hi - lo)

const anchorages = JSON.parse(readFileSync('public/data/anchorages.json', 'utf8'))
const areas = anchorages.features.filter(
  (f) => f.geometry.type === 'Polygon' && f.properties.category === 'anchorage',
)
const passage = anchorages.features.find((f) => f.properties.category === 'passage')

/** Route through the Passage Way, mirroring src/map/route.ts. */
function buildRoute(from, to) {
  if (!passage) return [from, to]
  const [west, south, east, north] = bbox(passage)
  const laneLat = (south + north) / 2
  const joinLon = Math.min(Math.max(from[0], west), east)
  const leaveLon = Math.min(Math.max(to[0], west), east)
  const path = [from, [joinLon, laneLat], [leaveLon, laneLat], to]
  return path.filter((p, i) => i === 0 || p[0] !== path[i - 1][0] || p[1] !== path[i - 1][1])
}

/** A point actually inside the given area, not merely inside its bounding box. */
function pointInArea(area) {
  const [west, south, east, north] = bbox(area)
  for (let tries = 0; tries < 200; tries++) {
    const p = [between(west, east), between(south, north)]
    if (booleanPointInPolygon(p, area)) return p
  }
  return [(west + east) / 2, (south + north) / 2]
}

const NAMES = [
  'MV Desert Star', 'MT Arabian Dawn', 'MV Gulf Trader', 'MT Hormuz Spirit', 'MV Pearl Carrier',
  'MT Oman Venture', 'MV Sea Falcon', 'MT Aden Pioneer', 'MV Coral Bay', 'MT Delta Horizon',
  'MV Indus Trader', 'MT Ruby Crest', 'MV Silver Wave', 'MT Amber Sky', 'MV Atlas Pioneer',
  'MT Gas Sentinel', 'MV Emirates Spirit', 'MT Khor Venture', 'MV Dana Bright', 'MT Nadir Trader',
  'MV Kestrel Bay', 'MT Tramontane', 'MV Ocean Sentinel', 'MT Zenith Star', 'MV Harbour Light',
  'MT Meridian Sun', 'MV Falcon Crest', 'MT Solstice Bay', 'MV Northern Dawn', 'MT Cardinal Wave',
]
const TYPES = [
  'bulkcarrier', 'container', 'generalcargo', 'carcarrier', 'chemicaltanker',
  'lngcarrier', 'livestockcarrier', 'crewboat', 'dredger', 'barge',
]
const FLAGS = ['AE', 'PA', 'LR', 'MH', 'MT', 'SG', 'BS', 'CY', 'HK', 'IN']

const samples = Math.round((TO - FROM) / (INTERVAL_MIN * 60_000))

const vessels = NAMES.slice(0, VESSEL_COUNT).map((name, i) => {
  const area = areas[i % areas.length]
  const berth = pointInArea(area)
  // Traffic for Fujairah comes off the Gulf of Oman, so approaches lie east.
  const offshore = destination(berth, APPROACH_KM, between(60, 110), { units: 'kilometers' })
    .geometry.coordinates
  // A fifth of the day's movements are sailings rather than arrivals.
  const outbound = i % 5 === 4
  const path = outbound ? buildRoute(berth, offshore) : buildRoute(offshore, berth)

  const line = lineString(path)
  const totalKm = turfLength(line, { units: 'kilometers' })
  // Stagger departures so they are not all under way at the same instant.
  const startFrac = between(0, 0.28)
  const runFrac = between(0.55, 0.95)

  const lengthM = Math.round(between(90, 330))
  const track = []
  for (let s = 0; s <= samples; s++) {
    const t = s / samples
    // Before startFrac the vessel is still stopped where she began.
    const moved = Math.min(1, Math.max(0, (t - startFrac) / runFrac))
    const at = along(line, totalKm * moved, { units: 'kilometers' }).geometry.coordinates
    const prev = track[track.length - 1]
    const running = moved > 0 && moved < 1
    track.push({
      at: new Date(FROM + s * INTERVAL_MIN * 60_000).toISOString(),
      lon: Number(at[0].toFixed(6)),
      lat: Number(at[1].toFixed(6)),
      speedKn: running ? Number((SEA_SPEED_KN * Math.min(1, (1 - moved) / 0.15)).toFixed(1)) : 0,
      headingDeg: prev
        ? Math.round((bearing([prev.lon, prev.lat], at) + 360) % 360)
        : Math.round(between(0, 359)),
      status: running ? 'underway' : moved >= 1 && !outbound ? 'anchored' : moved >= 1 ? 'underway' : 'anchored',
    })
  }

  return {
    id: `PB-${String(i + 1).padStart(3, '0')}`,
    name,
    imo: String(9100000 + i * 137),
    mmsi: String(470100000 + i * 911),
    type: pick(TYPES),
    flag: pick(FLAGS),
    lengthM,
    beamM: Math.max(11, Math.round(lengthM / 6.2)),
    draftM: Number((lengthM / 19 + 2).toFixed(1)),
    movement: outbound ? 'departure' : 'arrival',
    area: area.properties.code,
    track,
  }
})

const out = {
  day: DAY,
  from: new Date(FROM).toISOString(),
  to: new Date(TO).toISOString(),
  intervalMinutes: INTERVAL_MIN,
  samples: samples + 1,
  vessels,
}

writeFileSync('public/data/playback.json', JSON.stringify(out))
const kb = (JSON.stringify(out).length / 1024).toFixed(0)
console.log(`playback.json — ${vessels.length} vessels x ${samples + 1} samples (${kb} KB)`)
console.log(`  window ${out.from} → ${out.to} @ ${INTERVAL_MIN} min`)
console.log(`  arrivals ${vessels.filter((v) => v.movement === 'arrival').length}, departures ${vessels.filter((v) => v.movement === 'departure').length}`)
