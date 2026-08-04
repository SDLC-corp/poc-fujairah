import type { Map as MapLibreMap } from 'maplibre-gl'

export const ANCHOR_IMAGE_ID = 'anchor-mark'

/** Ring, shank, stock and flukes — the standard anchor mark. */
const ANCHOR_PATH =
  'M12 3.2a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2z M12 7.4V21 M7.6 11.2h8.8 M4.6 15.4c0 3.2 3.3 5.4 7.4 5.4s7.4-2.2 7.4-5.4'

/**
 * MapLibre needs a raster for `icon-image`, so the anchor is drawn once onto a
 * canvas at device resolution and registered with the style.
 */
export function registerAnchorIcon(map: MapLibreMap, pixelRatio = 2) {
  if (map.hasImage(ANCHOR_IMAGE_ID)) return

  const size = 26
  const canvas = document.createElement('canvas')
  canvas.width = size * pixelRatio
  canvas.height = size * pixelRatio
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.scale((size * pixelRatio) / 24, (size * pixelRatio) / 24)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const path = new Path2D(ANCHOR_PATH)
  // A light halo first, so the mark survives over dark hulls and water alike.
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 4.2
  ctx.stroke(path)
  ctx.strokeStyle = '#0a2540'
  ctx.lineWidth = 2
  ctx.stroke(path)

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  map.addImage(ANCHOR_IMAGE_ID, image, { pixelRatio })
}
