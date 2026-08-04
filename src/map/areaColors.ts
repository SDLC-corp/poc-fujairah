/**
 * Fill colours for the declared areas, following the published FAA chart.
 * Paired areas (BN/BS, VN/VS) share a colour there, so they share one here too.
 */
export const AREA_COLORS: Record<string, string> = {
  A: '#ec6ba4',
  N: '#f08a4b',
  C: '#5cb85c',
  G: '#8b5cf6',
  D: '#c084d8',
  BN: '#e03b32',
  BS: '#e03b32',
  VN: '#6b83e0',
  VS: '#6b83e0',
  T: '#22b8d6',
  W: '#eab308',
  S: '#f472a6',
  PW: '#64748b',
  RA: '#dc2626',
}

/** Marks that are not areas but share the anchorage source. */
export const ANCHOR_POINT_COLORS = { 'anchor-berth': '#0f766e', buoy: '#b45309' } as const

/** `match` input pairs for a MapLibre expression keyed on the `code` property. */
export const areaColorStops = Object.entries(AREA_COLORS).flat()
