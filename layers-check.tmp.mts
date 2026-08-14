import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { addPortLayers, SOURCE_IDS } from './src/map/layers.ts'

// A fake map that just records what addPortLayers tries to add, so the real
// specs can be run through the style-spec validator.
const layers: any[] = []
const sources: Record<string, any> = {}
const fake: any = {
  getStyle: () => ({ layers }),
  getLayer: (id: string) => layers.find((l) => l.id === id),
  getSource: (id: string) => sources[id],
  addSource: (id: string, src: any) => {
    sources[id] = src
  },
  addLayer: (layer: any) => {
    layers.push(layer)
  },
}

addPortLayers(fake)
console.log('layers added:', layers.length)

const style = {
  version: 8,
  name: 'check',
  glyphs: 'https://example.com/{fontstack}/{range}.pbf',
  sources: Object.fromEntries(
    Object.values(SOURCE_IDS).map((id) => [
      id,
      { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    ]),
  ),
  layers,
}

const errors = validateStyleMin(style as any)
if (!errors.length) {
  console.log('style validates clean')
} else {
  for (const e of errors) console.log('ERROR', e.message)
}

// Every source the style declares should be drawn by something — an orphaned
// source is either a layer that was dropped or one that never got added.
const used = new Set(layers.map((l) => l.source))
for (const id of Object.values(SOURCE_IDS)) {
  if (!used.has(id)) console.log('ORPHAN SOURCE', id)
}
