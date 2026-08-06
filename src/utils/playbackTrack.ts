import type { PlaybackSample, PlaybackVessel } from '../types/playback'

/**
 * The recorded fix at a 0–1 scrub position. Fixes are five minutes apart, so
 * the nearest one is picked rather than interpolated — the playhead lands on
 * real records, which is what the raw readout is meant to show.
 */
export function sampleAt(track: PlaybackSample[], progress: number): PlaybackSample | null {
  if (track.length === 0) return null
  const i = Math.round(Math.min(1, Math.max(0, progress)) * (track.length - 1))
  return track[i]
}

/** Index of that fix, for slicing the run-so-far. */
export function indexAt(track: PlaybackSample[], progress: number): number {
  if (track.length === 0) return 0
  return Math.round(Math.min(1, Math.max(0, progress)) * (track.length - 1))
}

/** The whole day's route for one vessel, as map coordinates. */
export function trackLine(vessel: PlaybackVessel): [number, number][] {
  return vessel.track.map((s) => [s.lon, s.lat])
}
