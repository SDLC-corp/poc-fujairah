import type { ThemeId } from '../features/ui/uiSlice'

const KEY = import.meta.env.VITE_MAPTILER_KEY

const style = (id: string) => `https://api.maptiler.com/maps/${id}/style.json?key=${KEY}`

/**
 * One basemap per console theme.
 *
 * All three are the same vector style in different lights, which matters for
 * more than looks: they carry the same layer names and the same glyphs and
 * sprites, so the port layers re-attach unchanged when the theme is swapped at
 * runtime, the city stays extrudable, and the sea can be repainted by the same
 * rule in each (see `configureWaterLayers`).
 */
export const BASEMAP_STYLES: Record<ThemeId, string> = {
  day: style('streets-v2'),
  dusk: style('streets-v2-dark'),
  night: style('streets-v2-night'),
}

/**
 * The sea, painted over whatever the basemap shipped.
 *
 * The styles differ in how they treat water — the night sheet in particular
 * goes almost black, which loses the anchorage against the land. These are the
 * blues the port's own charts use: pale enough in daylight to read soundings
 * through, deep enough after dark that the vessel marks and the dotted area
 * boundaries carry.
 */
export const SEA_INK: Record<ThemeId, string> = {
  day: '#c3dcf2',
  dusk: '#0b2647',
  night: '#061a33',
}

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

/**
 * The camera looks straight down, north up, and is held there.
 *
 * A chart is read north-up and in plan: the graticule, the compass rose and
 * every bearing on it assume so, and an operator passing a position over the
 * radio is reading a sheet, not a perspective view. Tilt and rotation only ever
 * put the chart into a state somebody then had to undo.
 *
 * This locks the *camera*, not the drawing. The vessel hulls and the building
 * footprints are still extruded geometry and still switchable — seen from
 * directly above they read as plans, which is what a chart wants.
 */
export const FIXED_PITCH = 0
export const FIXED_BEARING = 0
