import type { FeatureCollection } from 'geojson'
import type {
  ExpressionSpecification,
  LayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl'
import type { LayerId } from '../types/gis'
import { ANCHOR_POINT_COLORS, areaColorStops } from './areaColors'
import { ANCHOR_IMAGE_ID } from './anchorIcon'
import { vesselColorStops } from './vesselTypes'

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Fontstacks served by MapTiler's font API for the styles in `basemaps.ts`. */
const FONT_REGULAR = ['Noto Sans Regular']
const FONT_BOLD = ['Noto Sans Bold']

export const SOURCE_IDS = {
  anchorages: 'src-anchorages',
  vessels: 'src-vessels',
  hulls: 'src-vessel-hulls',
  swing: 'src-swing',
  freeSpots: 'src-free-spots',
  geofences: 'src-geofences',
  transit: 'src-transit',
  anchors: 'src-anchors',
  anchorDrop: 'src-anchor-drop',
  labels: 'src-labels',
  buffer: 'src-buffer',
  nearestLine: 'src-nearest-line',
} as const

/** Style layers belonging to each toggleable data layer, bottom to top. */
export const LAYER_GROUPS: Record<LayerId, string[]> = {
  anchorages: [
    'anchorages-fill',
    'anchorages-outline',
    'anchorages-point',
    'anchorages-point-label',
    'anchorages-label',
  ],
  vessels: [
    'vessels-halo',
    'vessels-circle',
    'vessels-hull-3d',
    'vessels-chain',
    'vessels-anchor',
    'vessels-label',
  ],
  swing: ['swing-fill', 'swing-outline', 'swing-label'],
  freeSpots: ['free-spot-fill', 'free-spot-outline'],
  geofences: ['geofence-fill', 'geofence-outline', 'geofence-label'],
}

/** Toggled together with the 3D switch. */
export const FLAT_VESSEL_LAYERS = ['vessels-halo', 'vessels-circle']
export const THREE_D_VESSEL_LAYERS = ['vessels-hull-3d']

/** Layers that respond to clicks, topmost first. */
export const INTERACTIVE_LAYERS = [
  'vessels-hull-3d',
  'anchorages-point',
  'vessels-circle',
  'anchorages-fill',
]

/** Incident fences: red for a hard exclusion, amber for advisory. */
const geofenceColor: ExpressionSpecification = [
  'match',
  ['get', 'kind'],
  'exclusion',
  '#dc2626',
  'advisory',
  '#d97706',
  '#64748b',
]

/** Chart colours live in areaColors.ts so the map and the legend cannot drift. */
const anchorageColor = [
  'match',
  ['get', 'code'],
  ...areaColorStops,
  // Anchor berths and channel buoys keep their own marks.
  [
    'match',
    ['get', 'category'],
    'anchor-berth',
    ANCHOR_POINT_COLORS['anchor-berth'],
    'buoy',
    ANCHOR_POINT_COLORS.buoy,
    '#0369a1',
  ],
] as unknown as ExpressionSpecification

const vesselColor = [
  'match',
  ['get', 'type'],
  ...vesselColorStops,
  '#94a3b8',
] as unknown as ExpressionSpecification

/**
 * The basemap already carries extruded building footprints; find that layer so
 * it can be shown from our default zoom instead of only when zoomed right in.
 */
export function findBuildingLayer(map: MapLibreMap): string | undefined {
  return map
    .getStyle()
    .layers.find(
      (layer) =>
        layer.type === 'fill-extrusion' &&
        'source-layer' in layer &&
        layer['source-layer'] === 'building',
    )?.id
}

/** Pulls the basemap's 3D buildings down to port-overview zoom and tones them. */
export function configureBuildingLayer(map: MapLibreMap, id: string) {
  map.setLayerZoomRange(id, 13.5, 24)
  map.setPaintProperty(id, 'fill-extrusion-color', '#8ea0b5')
  map.setPaintProperty(id, 'fill-extrusion-opacity', 0.85)
  map.setPaintProperty(id, 'fill-extrusion-vertical-gradient', true)
}

/** Vector-tile layers that carry street names and building/place names. */
const NAME_SOURCE_LAYERS = ['transportation_name', 'poi', 'place', 'housenumber', 'aeroway']

/**
 * Street and building names come from the basemap. The style only switches its
 * POI labels on at z14–16, so they are pulled forward to the port-overview zoom
 * where the tiles first carry them; the ids are returned so they can be toggled.
 */
export function configureNameLayers(map: MapLibreMap): string[] {
  const ids: string[] = []
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue
    if (!('source-layer' in layer)) continue
    const sourceLayer = layer['source-layer']
    if (!sourceLayer || !NAME_SOURCE_LAYERS.includes(sourceLayer)) continue

    ids.push(layer.id)

    // Around Fujairah most streets only carry an Arabic `name`, which leaves the
    // map unreadable for a non-Arabic audience. Prefer English, fall back to the
    // tiles' transliteration, then the local name. Shields keep their `ref`.
    const field = map.getLayoutProperty(layer.id, 'text-field')
    if (JSON.stringify(field ?? '').includes('name')) {
      map.setLayoutProperty(layer.id, 'text-field', [
        'coalesce',
        ['get', 'name:en'],
        ['get', 'name:latin'],
        ['get', 'name'],
      ])
    }

    // Housenumbers stay late — they are noise at port scale.
    if (sourceLayer === 'housenumber') continue
    const { minzoom = 0, maxzoom = 24 } = layer
    if (minzoom > 14) map.setLayerZoomRange(layer.id, 14, maxzoom)
  }
  return ids
}

/**
 * Registers every port source and style layer. Idempotent, and meant to be
 * called again after a basemap switch — `setStyle` discards custom sources and
 * layers, so they have to be re-attached to the incoming style.
 */
export function addPortLayers(map: MapLibreMap) {
  // Slot the port layers under the basemap's own labels: place names stay
  // readable, and our symbols still win collisions by being earlier in the style.
  const firstSymbol = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id

  const add = (layer: LayerSpecification, before = firstSymbol) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, before && map.getLayer(before) ? before : undefined)
  }

  for (const id of Object.values(SOURCE_IDS)) {
    // promoteId lets us drive selection styling with feature-state keyed by the
    // dataset's own `id` property instead of synthetic indices.
    if (!map.getSource(id)) {
      map.addSource(id, { type: 'geojson', data: EMPTY_FC, promoteId: 'id' })
    }
  }

  /* --- official anchorage areas (Notice to Mariners 346) --------------- */
  add({
    id: 'anchorages-fill',
    type: 'fill',
    source: SOURCE_IDS.anchorages,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': anchorageColor,
      // The sea is strongly blue, so the tints need real weight to read as the
      // chart's colours rather than as shades of the water.
      'fill-opacity': ['case', ['==', ['get', 'category'], 'restricted'], 0.14, 0.5],
    },
  })
  add({
    id: 'anchorages-outline',
    type: 'line',
    source: SOURCE_IDS.anchorages,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'line-color': anchorageColor,
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3.5, 1.6],
      'line-opacity': 0.9,
    },
  })
  add({
    id: 'anchorages-point',
    type: 'circle',
    source: SOURCE_IDS.anchorages,
    filter: ['==', ['geometry-type'], 'Point'],
    minzoom: 10,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 7],
      'circle-color': anchorageColor,
      'circle-stroke-width': 1.4,
      'circle-stroke-color': '#ffffff',
    },
  })
  add({
    id: 'anchorages-point-label',
    type: 'symbol',
    source: SOURCE_IDS.anchorages,
    filter: ['==', ['geometry-type'], 'Point'],
    minzoom: 12,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_REGULAR,
      'text-size': 10,
      'text-offset': [0, 1.1],
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#f8fafc', 'text-halo-width': 1.4 },
  })

  add({
    id: 'anchorages-label',
    type: 'symbol',
    source: SOURCE_IDS.labels,
    filter: ['==', ['get', 'kind'], 'anchorage'],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': FONT_BOLD,
      // The single-letter codes carry the map, so they are set larger.
      'text-size': ['case', ['get', 'isCode'], 20, 11],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.06,
      'text-max-width': 9,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#0c4a6e', 'text-halo-color': '#f8fafc', 'text-halo-width': 1.7 },
  })

  /* --- geofences: operator-drawn incident boundaries ------------------- */
  add({
    id: 'geofence-fill',
    type: 'fill',
    source: SOURCE_IDS.geofences,
    filter: ['==', ['get', 'active'], true],
    paint: { 'fill-color': geofenceColor, 'fill-opacity': 0.3 },
  })
  add({
    id: 'geofence-outline',
    type: 'line',
    source: SOURCE_IDS.geofences,
    // Round caps on a near-zero dash render as dots — a geofence reads as drawn
    // by an operator rather than as a surveyed boundary.
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': geofenceColor,
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 4.5, 3],
      'line-dasharray': [0.1, 2],
      // A dormant fence is drawn the same way, just fainter.
      'line-opacity': ['case', ['get', 'active'], 1, 0.45],
    },
  })
  add({
    id: 'geofence-label',
    type: 'symbol',
    source: SOURCE_IDS.geofences,
    minzoom: 11,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_BOLD,
      'text-size': 11,
      'text-max-width': 9,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#7f1d1d', 'text-halo-color': '#fff7ed', 'text-halo-width': 1.8 },
  })

  /* --- free spots: grid positions that clear every occupied circle ------ */
  add({
    id: 'free-spot-fill',
    type: 'fill',
    source: SOURCE_IDS.freeSpots,
    minzoom: 10.5,
    paint: { 'fill-color': '#16a34a', 'fill-opacity': 0.16 },
  })
  add({
    id: 'free-spot-outline',
    type: 'line',
    source: SOURCE_IDS.freeSpots,
    minzoom: 10.5,
    paint: {
      'line-color': '#15803d',
      'line-width': 1.2,
      'line-dasharray': [2, 2],
      'line-opacity': 0.85,
    },
  })

  /* --- swing circles: LOA x factor + safety margin --------------------- */
  add({
    id: 'swing-fill',
    type: 'fill',
    source: SOURCE_IDS.swing,
    minzoom: 12.5,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#f59e0b',
        '#0f172a',
      ],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.18, 0.05],
    },
  })
  add({
    id: 'swing-outline',
    type: 'line',
    source: SOURCE_IDS.swing,
    minzoom: 12.5,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#b45309',
        '#334155',
      ],
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0.7],
      'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0.55],
    },
  })
  // Only the selected vessel's radius is written on the map; 500 at once is noise.
  add({
    id: 'swing-label',
    type: 'symbol',
    source: SOURCE_IDS.swing,
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'id'], '__none__']],
    layout: {
      'text-field': ['concat', 'swing r ', ['to-string', ['get', 'radiusM']], ' m'],
      'text-font': FONT_BOLD,
      'text-size': 11,
      'text-offset': [0, -0.7],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#b45309', 'text-halo-color': '#f8fafc', 'text-halo-width': 1.7 },
  })

  /* --- ground tackle: the cable and the anchor on the bottom ----------- */
  add({
    id: 'vessels-chain',
    type: 'line',
    source: SOURCE_IDS.anchors,
    filter: ['==', ['get', 'kind'], 'chain'],
    minzoom: 12,
    paint: { 'line-color': '#0a2540', 'line-width': 1.1, 'line-opacity': 0.55 },
  })
  add({
    id: 'vessels-anchor',
    type: 'symbol',
    source: SOURCE_IDS.anchors,
    filter: ['==', ['get', 'kind'], 'anchor'],
    minzoom: 12,
    layout: {
      'icon-image': ANCHOR_IMAGE_ID,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 16, 0.85],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })

  /* --- letting go: the anchor falling and the splash it makes ---------- */
  add({
    id: 'anchor-drop-ripple',
    type: 'line',
    source: SOURCE_IDS.anchorDrop,
    filter: ['==', ['get', 'kind'], 'ripple'],
    paint: {
      'line-color': '#f8fafc',
      'line-width': 2.4,
      'line-opacity': ['get', 'opacity'],
    },
  })
  add({
    id: 'anchor-drop-chain',
    type: 'line',
    source: SOURCE_IDS.anchorDrop,
    filter: ['==', ['get', 'kind'], 'chain'],
    paint: { 'line-color': '#0a2540', 'line-width': 1.4, 'line-opacity': 0.7 },
  })
  add({
    id: 'anchor-drop-icon',
    type: 'symbol',
    source: SOURCE_IDS.anchorDrop,
    filter: ['==', ['get', 'kind'], 'anchor'],
    layout: {
      'icon-image': ANCHOR_IMAGE_ID,
      'icon-size': ['get', 'size'],
      'icon-rotate': ['get', 'rotation'],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })

  /* --- a vessel being walked to its assigned spot ---------------------- */
  // The planned route through the Passage Way, drawn faintly ahead of the ship.
  add({
    id: 'transit-plan',
    type: 'line',
    source: SOURCE_IDS.transit,
    filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'planned'], true]],
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': '#b45309',
      'line-width': 1.6,
      'line-dasharray': [1, 2.5],
      'line-opacity': 0.6,
    },
  })
  add({
    id: 'transit-track',
    type: 'line',
    source: SOURCE_IDS.transit,
    filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'planned'], true]],
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#b45309', 'line-width': 2.6, 'line-dasharray': [2, 1.6] },
  })
  add({
    id: 'transit-hull',
    type: 'fill-extrusion',
    source: SOURCE_IDS.transit,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-extrusion-color': '#f59e0b',
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-opacity': 0.95,
    },
  })

  /* --- vessels -------------------------------------------------------- */
  add({
    id: 'vessels-halo',
    type: 'circle',
    source: SOURCE_IDS.vessels,
    paint: {
      'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 16, 0],
      'circle-color': '#f59e0b',
      'circle-opacity': 0.3,
    },
  })
  add({
    id: 'vessels-circle',
    type: 'circle',
    source: SOURCE_IDS.vessels,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 9],
      'circle-color': vesselColor,
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.4],
      'circle-stroke-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fde047',
        '#0b1220',
      ],
    },
  })
  // Extruded hull + deckhouse. Both parts of a ship share its vessel id, so one
  // feature-state lights the whole hull when it is selected.
  add({
    id: 'vessels-hull-3d',
    type: 'fill-extrusion',
    source: SOURCE_IDS.hulls,
    paint: {
      'fill-extrusion-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        '#fde047',
        [
          'case',
          ['==', ['get', 'part'], 'superstructure'],
          '#f1f5f9',
          vesselColor as ExpressionSpecification,
        ],
      ],
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-opacity': 0.92,
      'fill-extrusion-vertical-gradient': true,
    },
  })
  // Names would blanket the anchorage at ~500 contacts, so only the selected
  // vessel is named; MapView narrows this filter to the clicked id.
  add({
    id: 'vessels-label',
    type: 'symbol',
    source: SOURCE_IDS.vessels,
    filter: ['==', ['get', 'id'], '__none__'],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': FONT_REGULAR,
      'text-size': 11,
      'text-offset': [0, 1.3],
    },
    paint: { 'text-color': '#0f172a', 'text-halo-color': '#f8fafc', 'text-halo-width': 1.6 },
  })

  /* --- analysis overlays ---------------------------------------------- */
  add(
    {
      id: 'buffer-fill',
      type: 'fill',
      source: SOURCE_IDS.buffer,
      paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.16 },
    },
    'vessels-halo',
  )
  add(
    {
      id: 'buffer-outline',
      type: 'line',
      source: SOURCE_IDS.buffer,
      paint: { 'line-color': '#b45309', 'line-width': 1.8, 'line-dasharray': [3, 2] },
    },
    'vessels-halo',
  )
  add({
    id: 'nearest-line',
    type: 'line',
    source: SOURCE_IDS.nearestLine,
    paint: { 'line-color': '#b45309', 'line-width': 2.2, 'line-dasharray': [1, 1] },
  })
  add({
    id: 'nearest-line-label',
    type: 'symbol',
    source: SOURCE_IDS.nearestLine,
    layout: {
      'text-field': ['concat', ['to-string', ['round', ['get', 'distanceM']]], ' m'],
      'text-font': FONT_REGULAR,
      'symbol-placement': 'line-center',
      'text-size': 11,
    },
    paint: { 'text-color': '#b45309', 'text-halo-color': '#f8fafc', 'text-halo-width': 1.6 },
  })
}
