/**
 * Generates public/data/incidents.json: a month of anchorage incidents, so the
 * incidents screens have a register to work on rather than a handful of
 * conditions the console happens to be detecting this second.
 *
 * Built from the data already in the repo — the vessels out of vessels.json and
 * the area codes out of anchorages.json — so every row names a ship that exists
 * and an area the notice declares. An incident register full of invented vessel
 * names is the fastest way to make a demo unbelievable to anyone who works
 * there.
 *
 * Deterministic — a seeded PRNG, so regenerating gives the same register.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  area as turfArea,
  bbox,
  booleanPointInPolygon,
  destination,
  polygon as turfPolygon,
} from '@turf/turf'

/** How many to write, and the window they fall in. */
const COUNT = 50
const DAYS = 30
/** Demo clock the sample screens are written against — the newest incident. */
const NOW = Date.UTC(2026, 7, 3, 9, 15)
const MINUTE = 60_000
const HOUR = 3600_000
const DAY = 24 * HOUR

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const rand = mulberry32(20260803)
const pick = (list) => list[Math.floor(rand() * list.length)]
const between = (lo, hi) => lo + rand() * (hi - lo)
const whole = (lo, hi) => Math.floor(between(lo, hi + 1))

/**
 * What the console can raise, and what each kind is worth.
 *
 * `weight` is how often it happens, not how bad it is: proximity warnings and
 * lost transponders are the daily traffic of a VTS watch, while a ship actually
 * inside the Restricted Area is rare and never routine. `severities` is what a
 * given kind is allowed to be — an anchor that has given way in a blow is never
 * "low", and a transponder that dropped out for ten minutes is never "high".
 */
const TYPES = [
  {
    id: 'anchor-dragging',
    label: 'Anchor Dragging',
    weight: 40,
    severities: ['high', 'high', 'medium'],
    geometry: 'polygon',
    /** Centred on the vessel: it is her ground tackle that gave way. */
    place: 'vessel',
    reasons: [
      'Shamal — strong north-westerly',
      'Insufficient cable veered',
      'Poor holding ground',
      'Heavy swell',
    ],
  },
  {
    id: 'oil-spill',
    label: 'Oil Spill',
    weight: 34,
    severities: ['high', 'high', 'medium'],
    geometry: 'polygon',
    /**
     * Placed in the water rather than on a ship.
     *
     * A slick is the one incident here that is not really about a vessel — she
     * is its source, but what is reported, boomed and recovered is a patch of
     * sea that drifts away from her. So it is sited in an area: half in the
     * anchorages where bunkering and transfers happen, half in the Restricted
     * Area, which is where the SPMs and the submarine pipelines are and so
     * where a spill matters most.
     */
    place: 'area-or-restricted',
    reasons: [
      'Bunkering transfer overflow',
      'Hose failure during transfer',
      'Discharge of oily residues',
      'SPM coupling leak',
      'Source not yet established',
    ],
  },
  {
    id: 'restricted-entry',
    label: 'Restricted Area Entry',
    weight: 26,
    severities: ['high', 'medium'],
    /** A polygon: the declared area itself is what was entered. */
    geometry: 'polygon',
    place: 'restricted',
    reasons: [
      'Vessel in distress — entry unavoidable',
      'Navigational error',
      'Vessel ordered to leave immediately',
      'Awaiting master response',
    ],
  },
]

/** One flat list, each type repeated by its weight, so `pick` honours it. */
const TYPE_POOL = TYPES.flatMap((t) => Array.from({ length: t.weight }, () => t))

const REPORTERS = [
  'System (Auto Alert)',
  'System (Auto Alert)',
  'System (Auto Alert)',
  'Operator',
  'VTS Watch Officer',
]

const OPERATORS = ['A. Mansoori', 'R. Khoury', 'S. Fernandes', 'J. Okonkwo', 'Port Control']

/**
 * Status by age.
 *
 * Not drawn at random: an incident from three weeks ago that is still open is a
 * failure of the watch, not a plausible register. So the older a row is the more
 * likely it has been dealt with, and only the last few days carry open ones.
 */
function statusFor(ageMs) {
  const days = ageMs / DAY
  if (days < 2) return rand() < 0.85 ? 'open' : 'resolved'
  if (days < 6) return rand() < 0.5 ? 'open' : 'resolved'
  if (days < 14) return rand() < 0.12 ? 'open' : pick(['resolved', 'resolved', 'closed'])
  return pick(['closed', 'closed', 'resolved'])
}

const iso = (ms) => new Date(ms).toISOString()

const vessels = JSON.parse(readFileSync('public/data/vessels.json', 'utf8'))
const anchorages = JSON.parse(readFileSync('public/data/anchorages.json', 'utf8'))

const fleet = vessels.features.filter((f) => f.geometry.type === 'Point')
const areas = anchorages.features.filter(
  (f) => f.geometry.type === 'Polygon' && f.properties.category === 'anchorage',
)
const restricted = anchorages.features.filter(
  (f) => f.geometry.type === 'Polygon' && f.properties.category === 'restricted',
)

if (!fleet.length) throw new Error('vessels.json has no point features — run gen:vessels first')
if (!areas.length) throw new Error('anchorages.json has no anchorage polygons')

/**
 * The affected water, as one of the two shapes the console can hold.
 *
 * Which shape follows from what the incident *is*, not from taste. A circle
 * where it happened at a point and reaches outward — a ship too close to her
 * neighbour, one making way too fast, one whose transponder stopped: she is
 * somewhere within a radius of where she last was, and a radius is the honest
 * statement of that. A polygon where it happened across an extent — a dragging
 * anchor has crossed water, and an area entered has its own boundary — so four
 * corners round the water in question say more than a circle centred on
 * nothing in particular.
 */
function geometryFor(at, spanKm) {
  const [lon, lat] = at
  // A quadrilateral around the place, deliberately not a rectangle in degrees:
  // a box of equal lon/lat spans is 10% wider than it is tall at this latitude,
  // and a register full of them would look drawn by a machine rather than by a
  // watch officer putting four corners round a problem.
  const corners = [45, 135, 225, 315].map((bearing) => {
    const jitter = bearing + between(-18, 18)
    const reach = spanKm * between(0.8, 1.2)
    const p = destination([lon, lat], reach, jitter, { units: 'kilometers' })
    return [round(p.geometry.coordinates[0]), round(p.geometry.coordinates[1])]
  })
  // Closed ring, which is what the details page counts as "5 points".
  return { kind: 'polygon', coordinates: [...corners, corners[0]] }
}

/**
 * A point inside a polygon, by rejection sampling its bounding box.
 *
 * The anchorage areas are convex enough that this lands inside within a few
 * tries; the cap is there so a pathological shape cannot spin for ever, and
 * falling back to the box centre is harmless because it is only ever the seed
 * for a slick that is then drawn around it.
 */
function pointInside(feature) {
  const [west, south, east, north] = bbox(feature)
  for (let i = 0; i < 40; i++) {
    const p = [between(west, east), between(south, north)]
    if (booleanPointInPolygon(p, feature)) return p
  }
  return [(west + east) / 2, (south + north) / 2]
}

/** Five decimals — about a metre, which is finer than any of this is known to. */
const round = (n) => Math.round(n * 1e5) / 1e5

/**
 * The measurements a given kind of incident is actually reported with.
 *
 * The slick's extent is measured off the ring that was drawn rather than
 * estimated from the span it was drawn with. Those are not the same figure: the
 * corners carry up to ±20% of jitter each, so a formula over the nominal span
 * disagreed with the shape on the chart by as much as a fifth. A record whose
 * stated area does not match its own geometry is the kind of thing somebody
 * notices in a review and stops trusting the rest of.
 */
function measurementsFor(type, geometry) {
  switch (type.id) {
    case 'anchor-dragging':
      return { dragDistanceM: whole(80, 450), windKt: whole(18, 42) }
    case 'oil-spill':
      return {
        affectedAreaKm2:
          Math.round((turfArea(turfPolygon([geometry.coordinates])) / 1e6) * 100) / 100,
        estimatedVolumeM3: whole(2, 140),
        windKt: whole(6, 30),
      }
    case 'restricted-entry':
      return { dwellMinutes: whole(4, 95), speedKn: Math.round(between(0, 9) * 10) / 10 }
    default:
      return { dwellMinutes: whole(5, 140) }
  }
}

const incidents = []

for (let i = 0; i < COUNT; i++) {
  const type = pick(TYPE_POOL)
  const vessel = pick(fleet)
  const p = vessel.properties

  // Newest first in the file, oldest last — so the list opens on what matters
  // without having to sort a register that is already in order.
  const ageMs = (i / COUNT) * DAYS * DAY + between(0, 6 * HOUR)
  const occurredMs = NOW - ageMs
  const status = statusFor(ageMs)
  const severity = pick(type.severities)
  const reportedBy = pick(REPORTERS)
  const reason = pick(type.reasons)

  /**
   * Where it happened, and in which declared area.
   *
   * The two are settled together because they have to agree: siting a slick in
   * the Restricted Area and then labelling it with the vessel's anchorage would
   * put a record on the list that its own chart contradicts.
   */
  let at
  let area
  if (type.place === 'restricted') {
    const ra = restricted[0]
    at = ra ? pointInside(ra) : vessel.geometry.coordinates
    area = ra?.properties.code ?? pick(areas).properties.code
  } else if (type.place === 'area-or-restricted') {
    // Alternating on the index rather than at random, so the split is even
    // however few spills a run happens to draw.
    const inRestricted = restricted.length > 0 && i % 2 === 0
    const host = inRestricted ? restricted[0] : pick(areas)
    at = pointInside(host)
    area = host.properties.code
  } else {
    at = vessel.geometry.coordinates
    area = p.area ?? pick(areas).properties.code
  }

  // A slick covers less water than a dragging anchor crosses. Drawn before it
  // is measured, so the figures come off the shape rather than the intent.
  const spanKm = type.id === 'oil-spill' ? between(0.35, 1.1) : between(0.9, 2.2)
  const geometry = geometryFor(at, spanKm)
  const measurements = measurementsFor(type, geometry)

  /**
   * Who it involves.
   *
   * A dragging anchor and an entry are about one ship by definition. A spill is
   * not: roughly a third of them are reported before anybody knows which vessel
   * it came off, which is the case the register has to be able to hold — a
   * record that waits for a source is a record nobody files while it matters.
   */
  const named = type.id === 'oil-spill' ? rand() > 0.32 : true
  const vessels = named
    ? [
        {
          id: p.id,
          name: p.name,
          imo: p.imo,
          // MMSI is not in vessels.json; derived from the IMO so it is stable
          // per ship rather than redrawn on every run.
          mmsi: `4700${String(p.imo).slice(-5)}`,
          type: p.type,
          lengthM: p.lengthM,
          flag: p.flag,
        },
      ]
    : []

  const where = area === restricted[0]?.properties.code ? 'in the Restricted Area' : `in Area ${area}`

  /** One line an operator would read off the list. */
  const description = {
    'anchor-dragging': `${p.name} dragged ${measurements.dragDistanceM} m in ${measurements.windKt} kt winds.`,
    'oil-spill': `Slick of about ${measurements.affectedAreaKm2} km² reported ${where}, ${
      named ? `source ${p.name}` : 'source not identified'
    }.`,
    'restricted-entry': `${p.name} entered the Restricted Area and remained ${measurements.dwellMinutes} minutes.`,
  }[type.id]

  /**
   * What happened to it, in order.
   *
   * Built from the status rather than bolted on: a resolved incident has a
   * resolution and an open one does not, and a timeline that ends in "resolved"
   * beside a status of "open" is the kind of detail that makes an operator stop
   * trusting the screen.
   */
  const timeline = [
    {
      at: iso(occurredMs),
      by: reportedBy,
      event: 'Raised',
      note: reportedBy.startsWith('System')
        ? 'Auto-alert triggered — threshold exceeded.'
        : 'Reported from the watch.',
    },
  ]

  const ackMs = occurredMs + whole(2, 18) * MINUTE
  if (status !== 'open' || rand() < 0.8) {
    timeline.push({
      at: iso(ackMs),
      by: pick(OPERATORS),
      event: 'Acknowledged',
      note: `Cause recorded as: ${reason}.`,
    })
  }

  if (severity === 'high') {
    timeline.push({
      at: iso(ackMs + whole(3, 25) * MINUTE),
      by: pick(OPERATORS),
      event: 'Broadcast',
      note: 'All-ships call made on VHF.',
    })
  }

  if (status !== 'open') {
    timeline.push({
      at: iso(occurredMs + whole(35, 600) * MINUTE),
      by: pick(OPERATORS),
      event: status === 'closed' ? 'Closed' : 'Resolved',
      note:
        status === 'closed'
          ? 'No further action required.'
          : 'Condition cleared — vessel back within limits.',
    })
  }

  incidents.push({
    id: `INC-2026-${String(COUNT - i).padStart(5, '0')}`,
    type: type.id,
    typeLabel: type.label,
    severity,
    status,
    occurredAt: iso(occurredMs),
    reportedBy,
    description,
    reason,
    area,
    vessels,
    measurements,
    geometry,
    timeline,
    notes:
      rand() < 0.55
        ? [
            {
              at: iso(occurredMs + whole(2, 40) * MINUTE),
              by: pick(OPERATORS),
              text: `${reason}. ${severity === 'high' ? 'Tugs placed on standby.' : 'Monitoring.'}`,
            },
          ]
        : [],
  })
}

const out = {
  generatedAt: iso(NOW),
  count: incidents.length,
  source: 'Generated by scripts/gen-incidents.mjs from vessels.json and anchorages.json',
  incidents,
}

writeFileSync('public/data/incidents.json', JSON.stringify(out))

const byStatus = incidents.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }), {})
const bySeverity = incidents.reduce(
  (acc, i) => ({ ...acc, [i.severity]: (acc[i.severity] ?? 0) + 1 }),
  {},
)
console.log(`incidents.json — ${incidents.length} incidents`)
console.log('  by status  ', byStatus)
console.log('  by severity', bySeverity)
console.log(
  '  by type    ',
  incidents.reduce((acc, i) => ({ ...acc, [i.type]: (acc[i.type] ?? 0) + 1 }), {}),
)
const spills = incidents.filter((i) => i.type === 'oil-spill')
const ra = restricted[0]?.properties.code
console.log(
  `  spills     ${spills.length}: ${spills.filter((i) => i.area === ra).length} in the Restricted Area, ` +
    `${spills.filter((i) => i.area !== ra).length} in anchorage areas`,
)
console.log(
  `  vessels    ${incidents.filter((i) => i.vessels.length === 0).length} with no vessel named, ` +
    `${incidents.filter((i) => i.vessels.length === 1).length} with one`,
)
