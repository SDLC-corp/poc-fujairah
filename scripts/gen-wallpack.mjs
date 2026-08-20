/**
 * Packs one anchorage full using WALLPACK_MHDF, and writes the result back into
 * public/data/vessels.json.
 *
 *   node scripts/gen-wallpack.mjs public/data/anchorages.json public/data/vessels.json [AREA]
 *
 * Every other area is left exactly as `gen:vessels` produced it — only the
 * chosen one (BN by default) is cleared and repacked. `npm run gen:vessels`
 * puts it back.
 *
 * The algorithm is Huang, Hsu & He (2010), "Assessing Capacity and Improving
 * Utilization of Anchorages", Figure 9:
 *
 *   1. If a two-side corner is available, take it.
 *   2. Else, of the vessel-side corners, take the one with the largest hole degree.
 *   3. Else, of the two-vessel corners, take the one with the largest hole degree.
 *   4. Else the anchorage is full.
 *
 * A *corner placement* is a position where the new disc touches two items — an
 * edge of the anchorage or an already-placed disc. Hole degree is `1 - dmin/r`,
 * where dmin is the distance to the nearest item *other* than the two being
 * touched: high hole degree means the disc is filling a hole rather than
 * sitting in open water. Starting with only the anchorage's own edges as items,
 * the first placements can only be corners — which is why the fill grows in
 * from the borders.
 *
 * Deterministic — a seeded PRNG, so repacking gives the same fleet.
 */
import { readFileSync, writeFileSync } from 'node:fs'

/** Must match analysisSlice and gen-vessels.mjs — radius = LOA x factor + margin. */
const SWING_FACTOR = 2
const SAFETY_MARGIN_M = 10
/**
 * Tangency is exact in the arithmetic and a coin flip in floating point, and
 * `verify-data.mjs` counts a touching pair as fouled. Every placement is backed
 * off its neighbours by this much so the result is provably clear rather than
 * marginally so.
 */
const EPS_M = 5
/**
 * The same idea against the anchorage boundary, but it needs more room. The
 * packing runs on a local equirectangular plane while the check is
 * `booleanWithin` on a 64-gon in degree space — two different approximations,
 * so a disc laid exactly on the boundary lands on either side of it at random.
 */
const EDGE_EPS_M = 10
/** Runaway guard; a real anchorage fills long before this. */
const MAX_VESSELS = 240
const NOW = Date.UTC(2026, 7, 3, 9, 15)
const HOUR = 3600_000

/**
 * The size mix to pack, largest first — WALLPACK's first heuristic is to place
 * big discs into the corners while the corners are still empty. A deliberately
 * wide spread, so the packing visibly interleaves large and small rather than
 * tiling one repeated circle.
 */
const SIZE_MIX = [
  { type: 'container', loa: 366, count: 2 },
  { type: 'chemicaltanker', loa: 333, count: 3 },
  { type: 'bulkcarrier', loa: 292, count: 4 },
  { type: 'container', loa: 260, count: 5 },
  { type: 'chemicaltanker', loa: 228, count: 6 },
  { type: 'bulkcarrier', loa: 196, count: 8 },
  { type: 'generalcargo', loa: 168, count: 10 },
  { type: 'chemicaltanker', loa: 144, count: 12 },
  { type: 'generalcargo', loa: 120, count: 14 },
  { type: 'barge', loa: 96, count: 16 },
  { type: 'crewboat', loa: 72, count: 20 },
  { type: 'crewboat', loa: 54, count: 24 },
]

/**
 * One wind, one tide, so every ship lies the same way — the anchorage reads as
 * rows of parallel needles rather than a scatter. A few degrees of yaw either
 * side, which is what a ship at anchor actually does.
 */
const MEAN_HEADING_DEG = 315
const YAW_DEG = 8

const FIRST = [
  'Gulf', 'Desert', 'Ocean', 'Silver', 'Coral', 'Hormuz', 'Arabian', 'Pearl', 'Falcon', 'Sea',
  'Emirates', 'Fujairah', 'Khor', 'Dana', 'Aurora', 'Meridian', 'Atlas', 'Orion', 'Zenith',
  'Horizon', 'Sapphire', 'Amber', 'Marlin', 'Osprey', 'Trident', 'Nautilus', 'Solstice', 'Cedar',
]
const SECOND = [
  'Star', 'Trader', 'Spirit', 'Pioneer', 'Voyager', 'Endeavour', 'Harmony', 'Venture', 'Glory',
  'Wave', 'Bay', 'Dawn', 'Breeze', 'Crown', 'Legacy', 'Explorer', 'Ranger', 'Sentinel',
]
const FLAGS = ['PA', 'LR', 'MH', 'SG', 'AE', 'MT', 'IN', 'BS', 'CY', 'HK']
const TANKERISH = ['chemicaltanker', 'lngcarrier']
const SMALL_CRAFT = ['crewboat', 'divingsupport', 'landingcraft', 'barge']
const PREFIX = (type) => (TANKERISH.includes(type) ? 'MT' : type === 'crewboat' ? 'CB' : 'MV')
const beamFor = (type, loa) =>
  SMALL_CRAFT.includes(type) ? Math.max(8, Math.round(loa / 3.5)) : Math.max(11, Math.round(loa / 6.2))
const draftFor = (loa) => Number((loa / 19 + 2).toFixed(1))
const radiusOf = (loa) => loa * SWING_FACTOR + SAFETY_MARGIN_M
const cableOf = (loa) => Math.max(0, loa * (SWING_FACTOR - 1))

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/* ------------------------------------------------------------------ *
 * A local metric plane. Packing in degrees is wrong — a degree of
 * longitude is shorter than one of latitude, so circles would come out
 * elliptical and tangency arithmetic would be meaningless. Everything
 * below works in metres about the area's own origin.
 * ------------------------------------------------------------------ */

function projector(lon0, lat0) {
  // Degree lengths on the WGS-84 ellipsoid at this latitude, rather than the
  // spherical shorthand. The verifier measures geodesic distance, so the closer
  // this plane is to the real thing the less slack the tangency margins need —
  // the plain 111320/110574 pair is out by ~0.07%, which is a metre and a half
  // across a swing circle and enough to turn a clear pair into a fouled one.
  const phi = (lat0 * Math.PI) / 180
  const mPerLat = 111132.95 - 559.85 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi)
  const mPerLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)
  return {
    to: ([lon, lat]) => [(lon - lon0) * mPerLon, (lat - lat0) * mPerLat],
    from: ([x, y]) => [lon0 + x / mPerLon, lat0 + y / mPerLat],
  }
}

/** Perpendicular distance from a point to a segment. */
function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function pointInRing([px, py], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function unit([x, y]) {
  const len = Math.hypot(x, y)
  return len < 1e-9 ? null : [x / len, y / len]
}

/* ------------------------------------------------------------------ *
 * Candidate corner placements
 * ------------------------------------------------------------------ */

/** Centres clear of both edges meeting at each vertex — the anchorage's corners. */
function twoSideCorners(ring, r) {
  const out = []
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]
    const here = ring[i]
    const next = ring[(i + 1) % n]
    // Unit vectors along the two edges leaving the vertex; the bisector points
    // into the polygon, and the offset along it puts the centre r from both.
    const a = unit([here[0] - prev[0], here[1] - prev[1]])
    const b = unit([next[0] - here[0], next[1] - here[1]])
    if (!a || !b) continue
    const bis = unit([b[0] - a[0], b[1] - a[1]])
    if (!bis) continue
    // Half-angle between the edges sets how far along the bisector r sits.
    const cross = a[0] * b[1] - a[1] * b[0]
    const dot = a[0] * b[0] + a[1] * b[1]
    const interior = Math.PI - Math.atan2(cross, dot)
    const sinHalf = Math.sin(interior / 2)
    if (Math.abs(sinHalf) < 1e-6) continue
    const d = (r + EDGE_EPS_M) / sinHalf
    for (const sign of [1, -1]) {
      out.push([here[0] + sign * bis[0] * d, here[1] + sign * bis[1] * d])
    }
  }
  return out
}

/** Centres clear of one edge and touching one placed disc — packed along a wall. */
function vesselSideCorners(ring, discs, r) {
  const out = []
  const n = ring.length
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    const dir = unit([b[0] - a[0], b[1] - a[1]])
    if (!dir) continue
    // Both inward candidates; the containment test throws away the outward one.
    for (const nrm of [
      [-dir[1], dir[0]],
      [dir[1], -dir[0]],
    ]) {
      const p0 = [a[0] + nrm[0] * (r + EDGE_EPS_M), a[1] + nrm[1] * (r + EDGE_EPS_M)]
      for (const disc of discs) {
        // Centre lies on this offset line and at R + r from the disc: drop a
        // perpendicular from the disc onto the line, then step along it.
        const want = disc.r + r + EPS_M
        const t = (disc.x - p0[0]) * dir[0] + (disc.y - p0[1]) * dir[1]
        const foot = [p0[0] + dir[0] * t, p0[1] + dir[1] * t]
        const perp = Math.hypot(disc.x - foot[0], disc.y - foot[1])
        if (perp > want) continue
        const half = Math.sqrt(Math.max(0, want * want - perp * perp))
        out.push([foot[0] + dir[0] * half, foot[1] + dir[1] * half])
        out.push([foot[0] - dir[0] * half, foot[1] - dir[1] * half])
      }
    }
  }
  return out
}

/** Centres touching two placed discs — the intersections of two offset circles. */
function twoVesselCorners(discs, r) {
  const out = []
  for (let i = 0; i < discs.length; i++) {
    for (let j = i + 1; j < discs.length; j++) {
      const A = discs[i]
      const B = discs[j]
      const rA = A.r + r + EPS_M
      const rB = B.r + r + EPS_M
      const dx = B.x - A.x
      const dy = B.y - A.y
      const d = Math.hypot(dx, dy)
      // Too far apart to share a tangent disc, or one inside the other.
      if (d > rA + rB || d < Math.abs(rA - rB) || d === 0) continue
      const a = (rA * rA - rB * rB + d * d) / (2 * d)
      const h = Math.sqrt(Math.max(0, rA * rA - a * a))
      const mx = A.x + (a * dx) / d
      const my = A.y + (a * dy) / d
      out.push([mx + (h * dy) / d, my - (h * dx) / d])
      out.push([mx - (h * dy) / d, my + (h * dx) / d])
    }
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Packing
 * ------------------------------------------------------------------ */

function pack(ring, sizes) {
  const discs = []
  const edges = []
  for (let i = 0; i < ring.length; i++) {
    edges.push([ring[i], ring[(i + 1) % ring.length]])
  }

  /** Wholly inside the anchorage, and clear of everything already placed. */
  const feasible = ([x, y], r) => {
    if (!pointInRing([x, y], ring)) return false
    for (const [a, b] of edges) if (distToSegment([x, y], a, b) < r + EDGE_EPS_M) return false
    // The same margin the candidates are generated with, so a placement that is
    // meant to touch a neighbour is accepted while one that bites into it is not.
    for (const d of discs) {
      if (Math.hypot(x - d.x, y - d.y) < d.r + r + EPS_M - 1e-6) return false
    }
    return true
  }

  /**
   * `1 - dmin/r`. dmin is the gap to the nearest item the placement is not
   * already touching, so a disc wedged into a hole scores near 1 and one
   * sitting against a single neighbour in open water scores near 0.
   */
  const holeDegree = ([x, y], r) => {
    let dmin = Infinity
    for (const [a, b] of edges) {
      const gap = distToSegment([x, y], a, b) - r
      if (gap > 1e-6) dmin = Math.min(dmin, gap)
    }
    for (const d of discs) {
      const gap = Math.hypot(x - d.x, y - d.y) - d.r - r
      if (gap > 1e-6) dmin = Math.min(dmin, gap)
    }
    return dmin === Infinity ? 1 : 1 - dmin / r
  }

  const best = (candidates, r) => {
    let pick = null
    for (const c of candidates) {
      if (!feasible(c, r)) continue
      const score = holeDegree(c, r)
      if (!pick || score > pick.score) pick = { at: c, score }
    }
    return pick
  }

  const placed = []
  const remaining = [...sizes]
  let skipped = 0

  while (remaining.length && placed.length < MAX_VESSELS) {
    const size = remaining[0]
    const r = radiusOf(size.loa)

    // Figure 9, in order: corners of the anchorage first, then against a wall,
    // then into a hole between two vessels.
    const pick =
      best(twoSideCorners(ring, r), r) ??
      best(vesselSideCorners(ring, discs, r), r) ??
      best(twoVesselCorners(discs, r), r)

    if (!pick) {
      // This size cannot be placed anywhere. Smaller ones still might, so drop
      // it and carry on rather than declaring the anchorage full.
      remaining.shift()
      skipped++
      continue
    }

    discs.push({ x: pick.at[0], y: pick.at[1], r })
    placed.push({ ...size, r, x: pick.at[0], y: pick.at[1] })
    size.count -= 1
    if (size.count <= 0) remaining.shift()
  }

  return { placed, skipped }
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const [, , anchoragesPath, vesselsPath, areaCodeArg] = process.argv
const areaCode = areaCodeArg ?? 'BN'

const anchorages = JSON.parse(readFileSync(anchoragesPath, 'utf8'))
const fleet = JSON.parse(readFileSync(vesselsPath, 'utf8'))

const area = anchorages.features.find(
  (f) => f.properties.code === areaCode && f.geometry.type === 'Polygon',
)
if (!area) throw new Error(`no polygon area with code ${areaCode}`)

// The outer ring, minus the repeated closing vertex.
const lonLatRing = area.geometry.coordinates[0].slice(0, -1)
const lon0 = lonLatRing.reduce((s, p) => s + p[0], 0) / lonLatRing.length
const lat0 = lonLatRing.reduce((s, p) => s + p[1], 0) / lonLatRing.length
const proj = projector(lon0, lat0)
const ring = lonLatRing.map(proj.to)

// Shoelace, for the utilisation figure.
let areaM2 = 0
for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
  areaM2 += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
}
areaM2 = Math.abs(areaM2 / 2)

const sizes = SIZE_MIX.map((s) => ({ ...s }))
const { placed, skipped } = pack(ring, sizes)

const rand = mulberry32(areaCode.split('').reduce((a, c) => a + c.charCodeAt(0), 11) * 7919)

// Keep every vessel that is not in the packed area, and carry on their numbering.
const kept = fleet.features.filter((f) => f.properties.area !== areaCode)
let n = kept.reduce((max, f) => {
  const m = /^V-(\d+)$/.exec(f.properties.id)
  return m ? Math.max(max, Number(m[1])) : max
}, 0)

const packedFeatures = placed.map((p, i) => {
  const headingDeg = Math.round(MEAN_HEADING_DEG + (rand() * 2 - 1) * YAW_DEG + 360) % 360
  // The disc is centred on the anchor; the ship rides back down her cable, so
  // she lies `cable` metres from it on the reciprocal of her heading.
  const cableM = cableOf(p.loa)
  const back = ((headingDeg + 180) * Math.PI) / 180
  const vessel = proj.from([p.x + Math.sin(back) * cableM, p.y + Math.cos(back) * cableM])

  n += 1
  const id = `V-${String(n).padStart(4, '0')}`
  return {
    type: 'Feature',
    id,
    properties: {
      id,
      name: `${PREFIX(p.type)} ${FIRST[(n + i) % FIRST.length]} ${
        SECOND[Math.floor((n + i) / FIRST.length) % SECOND.length]
      }`,
      imo: String(9200000 + ((n * 6733) % 799999)),
      type: p.type,
      flag: FLAGS[Math.floor(rand() * FLAGS.length)],
      lengthM: p.loa,
      beamM: beamFor(p.type, p.loa),
      draftM: draftFor(p.loa),
      speedKn: 0,
      headingDeg,
      status: 'anchored',
      area: areaCode,
      ata: new Date(NOW - Math.round((2 + rand() * 118) * HOUR)).toISOString(),
      etd: new Date(NOW + Math.round((3 + rand() * 93) * HOUR)).toISOString(),
    },
    geometry: {
      type: 'Point',
      coordinates: [Number(vessel[0].toFixed(6)), Number(vessel[1].toFixed(6))],
    },
  }
})

const features = [...kept, ...packedFeatures]
const body = features.map((f) => `    ${JSON.stringify(f)}`).join(',\n')
writeFileSync(
  vesselsPath,
  `{\n  "type": "FeatureCollection",\n  "name": "vessels",\n  "features": [\n${body}\n  ]\n}\n`,
)

const discArea = placed.reduce((s, p) => s + Math.PI * p.r * p.r, 0)
const byLoa = {}
for (const p of placed) byLoa[p.loa] = (byLoa[p.loa] ?? 0) + 1

console.log(`WALLPACK_MHDF — area ${areaCode}`)
console.log(`  anchorage area    ${(areaM2 / 1e6).toFixed(2)} km2`)
console.log(`  vessels placed    ${placed.length}${skipped ? ` (${skipped} sizes would not fit)` : ''}`)
console.log(`  swing utilisation ${((100 * discArea) / areaM2).toFixed(1)}%`)
console.log('  by LOA:', byLoa)
console.log(`  fleet total       ${features.length} (${kept.length} kept outside ${areaCode})`)
