/**
 * Generates public/data/contours.json and public/data/soundings.json: depth
 * contours and spot soundings over the Fujairah Anchorage Area and its
 * approaches.
 *
 * Why this exists rather than a ready-made contour tileset: MapTiler Ocean's
 * `contour_line` layer only carries the levels -25, -50, -100, -200, -250, -500…
 * The FAA lies in 65-145 m, so the whole anchorage would be crossed by a single
 * line. Contouring GEBCO ourselves gives a 10 m interval, which is what the
 * published chart uses at this scale.
 *
 * Depths are sampled from GEBCO 2020 (~450 m grid) through the OpenTopoData
 * public API, shifted onto the port's own chart datum, and run through Turf's
 * marching-squares isolines.
 *
 * Accuracy: spot-checked against the soundings printed on the FAA sheet
 * (NTM 346) — GEBCO reads -94 m where the chart prints 92-98, -141 m against
 * 133-141, -114 m against 110-118. Good agreement over the anchorage, which is
 * a smooth N-S shelf slope. It is NOT good inside the harbour, where a dredged
 * basin is narrower than one GEBCO cell; see PORT_NOTE below.
 *
 * Not for navigation.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isolines, pointGrid } from '@turf/turf'

const OUT = 'public/data/contours.json'
const OUT_SOUNDINGS = 'public/data/soundings.json'
/** Raw GEBCO samples, kept so re-running with new breaks costs no API calls. */
const CACHE = 'scripts/.gebco-cache.json'

/**
 * The FAA plus its approaches and the water off the quay. Deliberately stops
 * short of contouring the harbour itself — see PORT_NOTE.
 */
const EXTENT = [56.33, 25.05, 56.7, 25.36]
/** Matches GEBCO's native ~450 m posting; finer only invents detail. */
const CELL_KM = 0.45

/**
 * Fujairah Harbour Datum, from the port's published tidal levels: MSL stands
 * 1.7 m above it and LAT -0.1 m, so chart datum lies 1.8 m below mean sea level.
 * GEBCO is referenced to MSL, so charted depth = |GEBCO| - 1.8 and every figure
 * here reads the way the chart prints it.
 * https://fujairahport.ae/marine-centre/navigational-information/
 */
const MSL_ABOVE_DATUM_M = 1.7
const LAT_ABOVE_DATUM_M = -0.1
const MSL_TO_CHART_DATUM_M = MSL_ABOVE_DATUM_M - LAT_ABOVE_DATUM_M

/** 10 m interval; every 50 m is an index contour, drawn heavier on the map. */
const INTERVAL_M = 10
const MAX_DEPTH_M = 200
const MAJOR_EVERY_M = 50

/**
 * Spot soundings — the scattered depth figures that carry the sheet. Every grid
 * node would be a sounding every 450 m, which is denser than the chart and
 * unreadable, so they are taken in two tiers: every 8th node (3.6 km) and every
 * 4th (1.8 km), coarsest first. The tier goes onto the feature as
 * `symbol-sort-key`, and MapLibre's own collision detection then thins them by
 * zoom for free — the coarse tier wins placement and survives zoomed out, the
 * finer one fills in as the map opens up.
 *
 * There was a third tier at every 2nd node (0.9 km). It was 1068 of 1431
 * soundings and it made the water unreadable — nearly a megabyte of numbers
 * fighting for the same space. 1.8 km is about what the published sheet posts
 * at this scale, and it is the right floor.
 */
const SOUNDING_TIERS = [8, 4]

const PORT_NOTE =
  'Anchorage and approaches only. The dredged basin is narrower than one GEBCO ' +
  'cell, so harbour depths are not contoured — the chart states them as dredged ' +
  'areas (15.0 m 2019, 18.0 m 2010) and that is how they should be carried.'

/** OpenTopoData's public tier: <=100 locations per call, 1 call/second. */
const BATCH = 90
const THROTTLE_MS = 1100
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Samples seabed elevation (negative metres, MSL) for a list of [lng, lat]. */
async function sampleGebco(coords) {
  const elevations = []
  for (let i = 0; i < coords.length; i += BATCH) {
    const batch = coords.slice(i, i + BATCH)
    const locations = batch.map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join('|')
    const url = `https://api.opentopodata.org/v1/gebco2020?locations=${locations}`

    // The public API throttles hard; a 429 is expected under load, not a fault.
    let payload
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(url)
      if (res.ok) {
        payload = await res.json()
        break
      }
      if (res.status !== 429 && res.status !== 503) {
        throw new Error(`OpenTopoData → HTTP ${res.status}`)
      }
      await sleep(THROTTLE_MS * (attempt + 2))
    }
    if (!payload) throw new Error('OpenTopoData → rate limited, giving up')

    for (const result of payload.results) elevations.push(result.elevation)
    process.stdout.write(
      `\r  sampled ${Math.min(i + BATCH, coords.length)}/${coords.length} points`,
    )
    await sleep(THROTTLE_MS)
  }
  process.stdout.write('\n')
  return elevations
}

const grid = pointGrid(EXTENT, CELL_KM, { units: 'kilometers' })
console.log(`Grid: ${grid.features.length} points at ${CELL_KM} km over ${EXTENT.join(', ')}`)

let elevations
if (existsSync(CACHE)) {
  const cached = JSON.parse(readFileSync(CACHE, 'utf8'))
  if (cached.count === grid.features.length && cached.cellKm === CELL_KM) {
    elevations = cached.elevations
    console.log(`Reusing ${CACHE} — delete it to re-sample.`)
  }
}
if (!elevations) {
  elevations = await sampleGebco(grid.features.map((f) => f.geometry.coordinates))
  writeFileSync(
    CACHE,
    JSON.stringify({ count: grid.features.length, cellKm: CELL_KM, elevations }),
  )
}

// Land and anything shallower than the first break simply produces no contour,
// so the coastline needs no clipping.
grid.features.forEach((feature, i) => {
  const elevation = elevations[i]
  feature.properties.depth = elevation < 0 ? -elevation - MSL_TO_CHART_DATUM_M : -1
})

const breaks = []
for (let d = INTERVAL_M; d <= MAX_DEPTH_M; d += INTERVAL_M) breaks.push(d)

const lines = isolines(grid, breaks, { zProperty: 'depth' })

const features = lines.features
  .filter((f) => f.geometry.coordinates.length > 0)
  .map((f) => {
    // Turf writes the break back onto the feature as the zProperty.
    const depthM = Math.round(f.properties.depth)
    return {
      type: 'Feature',
      id: `CTR-${depthM}`,
      properties: {
        id: `CTR-${depthM}`,
        depthM,
        major: depthM % MAJOR_EVERY_M === 0,
        source: 'GEBCO 2020, contoured to Fujairah Harbour Datum',
      },
      geometry: f.geometry,
    }
  })

const collection = {
  type: 'FeatureCollection',
  metadata: {
    source: 'GEBCO 2020 via OpenTopoData',
    datum: 'Fujairah Harbour Datum (MSL less 1.8 m), per the port’s published tidal levels',
    intervalM: INTERVAL_M,
    gridResolutionM: Math.round(CELL_KM * 1000),
    extent: EXTENT,
    note: PORT_NOTE,
    disclaimer: 'Derived for demonstration. Not for navigation.',
  },
  features,
}

writeFileSync(OUT, `${JSON.stringify(collection)}\n`)
console.log(
  `Wrote ${OUT}: ${features.length} contours, ` +
    `${features.map((f) => f.properties.depthM).join('/')} m`,
)

/* --- spot soundings ---------------------------------------------------- */

// The grid is regular but its ordering is Turf's business, so the row and
// column of each node are recovered from the coordinates themselves rather
// than assumed from the index.
const axis = (values) => {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  return new Map(sorted.map((v, i) => [v, i]))
}
const key = (n) => Number(n.toFixed(6))
const cols = axis(grid.features.map((f) => key(f.geometry.coordinates[0])))
const rows = axis(grid.features.map((f) => key(f.geometry.coordinates[1])))

const soundings = []
for (const feature of grid.features) {
  const [lng, lat] = feature.geometry.coordinates
  // Land and the shallows inside the first contour carry no sounding here:
  // this grid cannot resolve them, and a wrong figure in shoal water is worse
  // than none at all.
  const depth = feature.properties.depth
  if (!(depth >= INTERVAL_M)) continue

  const ix = cols.get(key(lng))
  const iy = rows.get(key(lat))
  const tier = SOUNDING_TIERS.findIndex((step) => ix % step === 0 && iy % step === 0)
  if (tier === -1) continue

  const depthM = Math.round(depth)
  soundings.push({
    type: 'Feature',
    id: `SND-${ix}-${iy}`,
    properties: { id: `SND-${ix}-${iy}`, depthM, tier },
    geometry: { type: 'Point', coordinates: [Number(lng.toFixed(5)), Number(lat.toFixed(5))] },
  })
}

writeFileSync(
  OUT_SOUNDINGS,
  `${JSON.stringify({
    type: 'FeatureCollection',
    metadata: {
      source: 'GEBCO 2020 via OpenTopoData',
      datum: collection.metadata.datum,
      gridResolutionM: collection.metadata.gridResolutionM,
      spacingM: SOUNDING_TIERS.map((step) => Math.round(step * CELL_KM * 1000)),
      extent: EXTENT,
      note:
        'Interpolated from a ~450 m grid, not measured least depths. A charted ' +
        'sounding is the shoalest depth found over a patch; these are not. ' +
        PORT_NOTE,
      disclaimer: 'Derived for demonstration. Not for navigation.',
    },
    features: soundings,
  })}\n`,
)
const perTier = SOUNDING_TIERS.map(
  (step, tier) => `${soundings.filter((s) => s.properties.tier === tier).length}@${step * CELL_KM}km`,
)
console.log(`Wrote ${OUT_SOUNDINGS}: ${soundings.length} soundings (${perTier.join(', ')})`)
console.log(PORT_NOTE)
