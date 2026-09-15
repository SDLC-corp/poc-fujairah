import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../app/store'
import type { PlaybackData } from '../../types/playback'

const selectRaw = (s: RootState) => s.playback.data
const selectFromTime = (s: RootState) => s.playback.fromTime
const selectToTime = (s: RootState) => s.playback.toTime

export interface PlaybackWindow {
  /** The window actually in force, in epoch ms. */
  fromMs: number
  toMs: number
  /** The whole recorded day, for comparison and for the reset control. */
  dayFromMs: number
  dayToMs: number
  /** False when the window is the whole day — nothing has been chosen. */
  trimmed: boolean
  /**
   * True when what was asked for had to be pulled back inside the recording.
   * The screen says so, because otherwise the replay quietly runs over hours
   * the operator did not choose.
   */
  clamped: boolean
  /** True when the request missed the recording altogether. */
  outside: boolean
}

/** `HH:MM` UTC for a moment, which is what the time fields speak. */
export const hhmmUtc = (ms: number) => new Date(ms).toISOString().slice(11, 16)

/**
 * Every time the window can start or end at: one per recorded fix.
 *
 * Built from the file's own span and sampling interval rather than from a
 * clock, so the list cannot offer an hour the recording does not cover — the
 * fault that made a chosen window come back empty.
 */
export const selectReplayTimes = createSelector([selectRaw], (data): string[] => {
  if (!data) return []
  const from = Date.parse(data.from)
  const to = Date.parse(data.to)
  const stepMs = Math.max(1, data.intervalMinutes) * 60_000
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return []

  const out: string[] = []
  // Capped so a long recording at a fine interval cannot build a list nobody
  // could use; the window is clamped to the span regardless of what is listed.
  for (let t = from; t <= to && out.length < 600; t += stepMs) out.push(hhmmUtc(t))
  return out
})

/**
 * The slice of the recorded day being replayed.
 *
 * Unset ends fall back to the file's own bounds, so "from 14:00" means 14:00 to
 * the end of the recording rather than 14:00 to nothing. A window given
 * backwards is read as the range between the two times rather than refused —
 * an operator who types 18:00 and then 06:00 has said which six hours they
 * want perfectly clearly.
 *
 * Both ends are then held inside the recording, which is the part that matters:
 * this file covers 12:00 to 18:00, not a whole day, so a window of 09:00 to
 * 11:00 is not a short replay — it is every track emptied and a screen that
 * does nothing when play is pressed. A request that misses the recording
 * entirely gives the whole of it back and says so.
 */
export const selectPlaybackWindow = createSelector(
  [selectRaw, selectFromTime, selectToTime],
  (data, from, to): PlaybackWindow | null => {
    if (!data) return null
    const dayFromMs = Date.parse(data.from)
    const dayToMs = Date.parse(data.to)

    /**
     * A time field's value as a moment on the recorded day.
     *
     * Parsed rather than pasted into a template, because a time input does not
     * always hand back `HH:MM`: with seconds enabled it gives `HH:MM:SS`, and
     * `${day}T13:00:00:00Z` is not a date — it is NaN, which fell back to the
     * whole day and made the window look as though it had simply been ignored.
     * Accepts `H:MM`, `HH:MM` and `HH:MM:SS`; anything else means not chosen.
     */
    const at = (value: string | null, fallback: number) => {
      if (!value) return fallback
      const parts = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(value.trim())
      if (!parts) return fallback
      const hours = Number(parts[1])
      if (hours > 23) return fallback
      // The file is UTC and so is the console's clock on this screen.
      const ms = Date.parse(
        `${data.day}T${String(hours).padStart(2, '0')}:${parts[2]}:${parts[3] ?? '00'}Z`,
      )
      return Number.isNaN(ms) ? fallback : ms
    }

    let fromMs = at(from, dayFromMs)
    let toMs = at(to, dayToMs)
    if (toMs < fromMs) [fromMs, toMs] = [toMs, fromMs]

    const asked = { fromMs, toMs }
    fromMs = Math.min(Math.max(fromMs, dayFromMs), dayToMs)
    toMs = Math.max(Math.min(toMs, dayToMs), dayFromMs)

    // Wholly before or wholly after the recording: there is no window to give,
    // so the day stands rather than leaving a replay with nothing in it.
    const outside = fromMs >= toMs
    if (outside) {
      fromMs = dayFromMs
      toMs = dayToMs
    }

    return {
      fromMs,
      toMs,
      dayFromMs,
      dayToMs,
      trimmed: fromMs > dayFromMs || toMs < dayToMs,
      clamped: !outside && (asked.fromMs < dayFromMs || asked.toMs > dayToMs),
      outside,
    }
  },
)

/**
 * The recorded day cut down to that window.
 *
 * Done by trimming each vessel's track rather than by teaching the transport,
 * the timeline, the map and the readouts each to respect a window: every one of
 * them already works in fractions of whatever track it is given, so a shorter
 * track *is* a shorter replay, and the scrub bar spans the chosen hours by
 * construction. Untrimmed it hands back the original object, so nothing
 * re-renders for a window nobody set.
 */
export const selectWindowedPlayback = createSelector(
  [selectRaw, selectPlaybackWindow],
  (data, window): PlaybackData | null => {
    if (!data || !window?.trimmed) return data
    const vessels = data.vessels.map((v) => ({
      ...v,
      track: v.track.filter((s) => {
        const t = Date.parse(s.at)
        return t >= window.fromMs && t <= window.toMs
      }),
    }))
    return {
      ...data,
      from: new Date(window.fromMs).toISOString(),
      to: new Date(window.toMs).toISOString(),
      samples: vessels.reduce((most, v) => Math.max(most, v.track.length), 0),
      vessels,
    }
  },
)
