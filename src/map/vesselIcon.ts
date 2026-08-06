import type { Map as MapLibreMap } from 'maplibre-gl'
import { VESSEL_COLORS, VESSEL_TYPES } from './vesselTypes'

/** `ship-<type>`, e.g. `ship-lngcarrier`. */
export const shipImageId = (type: string) => `ship-${type}`
/** Fallback for a type the palette does not cover. */
export const SHIP_FALLBACK_ID = 'ship-unknown'

/**
 * The conventional AIS ship symbol: pointed bow, parallel sides, square stern,
 * drawn bow-up so `icon-rotate` can take the heading directly.
 */
const SHIP_PATH = 'M12 2.2 L17.6 9.4 L17.6 21 L6.4 21 L6.4 9.4 Z'

function drawShip(color: string, pixelRatio: number): ImageData | null {
  const size = 26
  const canvas = document.createElement('canvas')
  canvas.width = size * pixelRatio
  canvas.height = size * pixelRatio
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.scale((size * pixelRatio) / 24, (size * pixelRatio) / 24)
  ctx.lineJoin = 'round'

  const path = new Path2D(SHIP_PATH)
  // White halo first so pale hull colours still read against the water, then a
  // dark keyline, then the type colour itself.
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3.4
  ctx.stroke(path)
  ctx.fillStyle = color
  ctx.fill(path)
  ctx.strokeStyle = 'rgba(10, 37, 64, 0.85)'
  ctx.lineWidth = 1.2
  ctx.stroke(path)

  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * MapLibre can only tint an icon per-feature when the image is SDF, which would
 * lose the keyline. One pre-coloured image per vessel type instead — there are
 * only fourteen, and they are registered once per style load.
 */
export function registerVesselIcons(map: MapLibreMap, pixelRatio = 2) {
  for (const type of VESSEL_TYPES) {
    const id = shipImageId(type)
    if (map.hasImage(id)) continue
    const image = drawShip(VESSEL_COLORS[type], pixelRatio)
    if (image) map.addImage(id, image, { pixelRatio })
  }
  if (!map.hasImage(SHIP_FALLBACK_ID)) {
    const image = drawShip('#94a3b8', pixelRatio)
    if (image) map.addImage(SHIP_FALLBACK_ID, image, { pixelRatio })
  }
}
