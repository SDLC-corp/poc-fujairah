/**
 * Sanity-checks the static datasets with the same Turf operations the UI uses.
 * Run with: node scripts/verify-data.mjs
 */
import { readFile } from 'node:fs/promises'
import { area, booleanPointInPolygon, distance } from '@turf/turf'

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
