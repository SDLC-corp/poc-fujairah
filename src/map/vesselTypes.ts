import type { VesselType } from '../types/gis'

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

export const VESSEL_TYPES = Object.keys(VESSEL_COLORS) as VesselType[]

/** `match` input pairs for a MapLibre expression keyed on the `type` property. */
export const vesselColorStops = VESSEL_TYPES.flatMap((t) => [t, VESSEL_COLORS[t]])
