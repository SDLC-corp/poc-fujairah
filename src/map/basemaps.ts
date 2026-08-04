const KEY = import.meta.env.VITE_MAPTILER_KEY

/**
 * MapTiler Streets vector basemap. Vector styles ship their own glyphs, sprites
 * and building footprints, so the port layers get real fonts and the city can be
 * extruded without any extra data.
 */
export const BASEMAP_STYLE = `https://api.maptiler.com/maps/streets-v2/style.json?key=${KEY}`

/**
 * The map opens on the Fujairah Anchorage Area — that is where the vessels are.
 * The quay itself is reachable from the "Port" extent preset.
 */
export const INITIAL_CENTER: [number, number] = [56.497, 25.228]
export const INITIAL_ZOOM = 11.2
/** Extent of the port itself, used by the "Port" camera preset. */
export const PORT_BOUNDS: [[number, number], [number, number]] = [
  [56.3555, 25.1755],
  [56.3995, 25.2],
]

/** Camera tilt used when 3D is switched on. */
export const PITCHED_VIEW = 55
/** MapLibre allows up to 85°; near-horizon views make the hulls read as models. */
export const MAX_PITCH = 80
