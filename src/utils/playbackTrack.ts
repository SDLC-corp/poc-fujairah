import type { PlaybackData, PlaybackSample, PlaybackVessel } from '../types/playback'

/**
 * The moment the playhead sits at.
 *
 * Progress is a fraction of the *window*, so the clock is worked from the
 * window's own ends rather than from the length of anybody's track. That is the
 * whole point of doing it this way: a window can reach past the recording, or
 * miss it entirely, and a playhead measured in array positions cannot express
 * either — it would race a five-hour window through a one-hour run of fixes and
 * report the wrong time while doing it.
 */
export function playheadMs(data: Pick<PlaybackData, 'from' | 'to'>, progress: number): number {
  const from = Date.parse(data.from)
  const to = Date.parse(data.to)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return NaN
  return from + Math.min(1, Math.max(0, progress)) * (to - from)
}

/**
 * Index of the fix at or before a moment, or -1 when the track has not begun.
 *
 * At or before, not nearest: what the chart shows is the last thing that was
 * actually reported, and a vessel whose first fix is still in the future has
 * not been seen yet rather than being at her first position early. -1 is
 * therefore a real answer — it is how a replay that starts before a vessel was
 * recorded leaves her off the map until she appears.
 *
 * Binary search, because tracks are in time order and this runs once per vessel
 * per frame.
 */
export function indexAtTime(track: PlaybackSample[], ms: number): number {
  if (!track.length || !Number.isFinite(ms)) return -1
  let lo = 0
  let hi = track.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (Date.parse(track[mid].at) <= ms) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** That fix itself. Null when the track has not begun by this moment. */
export function sampleAtTime(track: PlaybackSample[], ms: number): PlaybackSample | null {
  const i = indexAtTime(track, ms)
  return i < 0 ? null : track[i]
}

/** The whole day's route for one vessel, as map coordinates. */
export function trackLine(vessel: PlaybackVessel): [number, number][] {
  return vessel.track.map((s) => [s.lon, s.lat])
}
