import { readFileSync } from 'node:fs'
import { booleanIntersects, circle, distance } from '@turf/turf'

const areas = JSON.parse(readFileSync('public/data/anchorages.json', 'utf8'))
const vessels = JSON.parse(readFileSync('public/data/vessels.json', 'utf8'))
const polys = areas.features.filter((f) => f.geometry.type === 'Polygon')

// Search the anchorage bbox for the largest disc that clears every declared
// polygon and keeps clear of every vessel.
let best = null
for (let lng = 56.38; lng <= 56.58; lng += 0.005) {
  for (let lat = 25.14; lat <= 25.32; lat += 0.005) {
    const c = [Number(lng.toFixed(4)), Number(lat.toFixed(4))]
    let r = 0
    for (const test of [2.5, 2.2, 2.0, 1.8, 1.5, 1.2, 1.0]) {
      const disc = circle(c, test, { steps: 48, units: 'kilometers' })
      if (polys.some((p) => booleanIntersects(disc, p))) continue
      if (vessels.features.some((v) => distance(c, v, { units: 'kilometers' }) < test + 0.3)) continue
      r = test
      break
    }
    if (r && (!best || r > best.r)) best = { c, r }
  }
}
console.log('best clear disc inside the anchorage bbox:', JSON.stringify(best))
