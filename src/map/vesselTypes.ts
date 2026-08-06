import type { VesselProps, VesselType } from '../types/gis'

/** AIS vessel-type palette, as supplied. Single source of truth for map + UI. */
export const VESSEL_COLORS: Record<VesselType, string> = {
  barge: '#FFBF00',
  bulkcarrier: '#9966CC',
  cableship: '#007FFF',
  carcarrier: '#F5F5DC',
  chemicaltanker: '#0095B6',
  container: '#8A2BE2',
  crewboat: '#DE5D83',
  divingsupport: '#CD7F32',
  dredger: '#702963',
  generalcargo: '#02A4D3',
  heavyliftvsl: '#F7E7CE',
  landingcraft: '#0047AB',
  livestockcarrier: '#FF7F50',
  lngcarrier: '#50C878',
}

export const VESSEL_LABELS: Record<VesselType, string> = {
  barge: 'Barge',
  bulkcarrier: 'Bulk carrier',
  cableship: 'Cable ship',
  carcarrier: 'Car carrier',
  chemicaltanker: 'Chemical tanker',
  container: 'Container',
  crewboat: 'Crew boat',
  divingsupport: 'Diving support',
  dredger: 'Dredger',
  generalcargo: 'General cargo',
  heavyliftvsl: 'Heavy lift vessel',
  landingcraft: 'Landing craft',
  livestockcarrier: 'Livestock carrier',
  lngcarrier: 'LNG carrier',
}

export type VesselStatus = VesselProps['status']

/**
 * How each AIS status is written in the UI. `awaiting` is the queue the
 * assignment workflow feeds from — vessels in port limits with no spot yet.
 */
export const VESSEL_STATUS_LABELS: Record<VesselStatus, string> = {
  awaiting: 'Waiting to anchor',
  anchored: 'At anchor',
  underway: 'Under way',
  shifting: 'Proceeding to berth',
  berthing: 'Berthing',
  moored: 'Moored alongside',
  sailed: 'Sailed',
}

/** Short form for the status pill, where the full wording will not fit. */
export const VESSEL_STATUS_SHORT: Record<VesselStatus, string> = {
  awaiting: 'Waiting',
  anchored: 'Anchored',
  underway: 'Under way',
  shifting: 'To berth',
  berthing: 'Berthing',
  moored: 'Moored',
  sailed: 'Sailed',
}

/** Offered in call order, which is how an operator thinks about the move. */
export const VESSEL_STATUS_ORDER: VesselStatus[] = [
  'awaiting',
  'anchored',
  'underway',
  'shifting',
  'berthing',
  'moored',
  'sailed',
]

/**
 * States in which the vessel is not on the water in the anchorage: `awaiting`
 * is queued outside the declared areas, `sailed` has left. Everything else is
 * physically there and takes up water, whether or not it is on its anchor.
 *
 * This is the single test behind "is a spot occupied?" and "does this vessel
 * block a free spot?" — the two must agree or capacity will not add up.
 */
export const VESSEL_ABSENT: ReadonlySet<VesselStatus> = new Set<VesselStatus>([
  'awaiting',
  'sailed',
])

/** True when the vessel is lying in the anchorage and so taking up water. */
export const takesUpWater = (status: VesselStatus) => !VESSEL_ABSENT.has(status)

export const VESSEL_TYPES = Object.keys(VESSEL_COLORS) as VesselType[]

/** `match` input pairs for a MapLibre expression keyed on the `type` property. */
export const vesselColorStops = VESSEL_TYPES.flatMap((t) => [t, VESSEL_COLORS[t]])
