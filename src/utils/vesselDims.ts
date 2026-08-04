import type { VesselType } from '../types/gis'

/** Small craft are proportionally beamier than cargo ships. */
const SMALL_CRAFT: VesselType[] = ['crewboat', 'divingsupport', 'landingcraft', 'barge']

/** Rough beam from length — good enough to size a hull the operator did not measure. */
export function beamForLength(type: VesselType, lengthM: number): number {
  return SMALL_CRAFT.includes(type)
    ? Math.max(8, Math.round(lengthM / 3.5))
    : Math.max(11, Math.round(lengthM / 6.2))
}

/** Rough loaded draft from length. */
export function draftForLength(lengthM: number): number {
  return Number((lengthM / 19 + 2).toFixed(1))
}
