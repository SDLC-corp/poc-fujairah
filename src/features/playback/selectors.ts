import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../app/store'
import type { PlaybackData } from '../../types/playback'
import { formatDateTime } from '../../utils/format'

const selectRaw = (s: RootState) => s.playback.data
const selectFromDate = (s: RootState) => s.playback.fromDate
const selectToDate = (s: RootState) => s.playback.toDate
const selectFromTime = (s: RootState) => s.playback.fromTime
const selectToTime = (s: RootState) => s.playback.toTime

const DAY_MS = 86_400_000

/**
 * How much of the archive one replay may cover.
 *
 * Two days, which is also the span the date pickers are bounded to. A replay is
 * scaled against real time, so the limit is not arbitrary housekeeping: at the
 * slowest speed a two-day window already runs for the best part of half an
 * hour, and every fix inside it is held in memory and re-sampled on every frame.
 * A month-long window asks the browser to do something no operator would sit
 * through.
 */
export const MAX_WINDOW_DAYS = 2
const MAX_WINDOW_MS = MAX_WINDOW_DAYS * DAY_MS

/** Why a chosen window cannot be replayed. */
export type WindowFault = 'backwards' | 'too-long'

export interface PlaybackWindow {
  /** The window actually in force, in epoch ms. */
  fromMs: number
  toMs: number
  /** The whole recorded span, for comparison and for the reset control. */
  dayFromMs: number
  dayToMs: number
  /**
   * The part of the window the recording actually covers, or null for none.
   *
   * The window is what was asked for and this is what is in it, and the two are
   * kept apart deliberately. The window used to be quietly replaced by the
   * recording whenever it reached outside — which made the clocks, the scrub bar
   * and the timeline all report hours the operator had not chosen, and read as
   * though the pickers had been ignored. Now the window stands and this says
   * what is in it.
   */
  coveredFromMs: number | null
  coveredToMs: number | null
  /** False when the window is the whole recording — nothing has been chosen. */
  trimmed: boolean
  /** Some of the window has no recording behind it. */
  partial: boolean
  /** None of it does: the window and the recording do not overlap at all. */
  outside: boolean
  /**
   * The window covers more than one calendar day.
   *
   * Every clock on the screen reads off this: inside one day `14:00Z` is a
   * moment, and across two days it is two moments, so the date stops being
   * decoration and becomes the half of the reading that disambiguates it.
   */
  multiDay: boolean
  /**
   * Whole days the archive is shifted by to reach this window's date, 0 for none.
   *
   * The archive is one recorded day. Rather than leaving every other date empty,
   * its tracks are re-stamped onto the date being replayed, keeping their time
   * of day — so picking any date shows that day's traffic running at the hours
   * it ran at. It is the same movement relabelled, not history for that date,
   * and the screen says so: a console that quietly answers "what happened on the
   * 16th" with another day's tracks would be worse than one that answers
   * nothing.
   */
  shiftDays: number
  /**
   * What is wrong with the window, or null when it can be replayed.
   *
   * A fault is not the same thing as an empty window. `outside` says the
   * archive has nothing for hours the operator legitimately asked for, and the
   * replay still runs its clock through them; a fault says the request is not a
   * window at all, so it is *not applied* — the screen says why and leaves the
   * previous replay alone rather than acting on something it cannot honour.
   */
  fault: WindowFault | null
}

/** `2026-08-03` shifted by whole days, for bounding the date pickers. */
export function shiftDay(day: string, days: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`)
  return Number.isNaN(ms) ? day : ymdUtc(ms + days * DAY_MS)
}

/** `HH:MM` UTC for a moment, which is what the time fields speak. */
export const hhmmUtc = (ms: number) => new Date(ms).toISOString().slice(11, 16)

/** `YYYY-MM-DD` UTC, which is what the date fields speak. */
export const ymdUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** `03 Aug 13:00` — a moment that has to say which day it is on. */
export const stampUtc = (ms: number) => formatDateTime(new Date(ms).toISOString())

/** Milliseconds into a day for an `H:MM`, `HH:MM` or `HH:MM:SS`, or null. */
function clockMs(value: string): number | null {
  const parts = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(value.trim())
  if (!parts) return null
  const hours = Number(parts[1])
  if (hours > 23) return null
  return (hours * 3600 + Number(parts[2]) * 60 + Number(parts[3] ?? 0)) * 1000
}

/** Midnight UTC on a `YYYY-MM-DD`, or null if it is not one. */
function midnightMs(day: string): number | null {
  const ms = Date.parse(`${day}T00:00:00Z`)
  return Number.isNaN(ms) ? null : ms
}

/** How far apart the offered clocks are. Half-hourly is 48 of them, scannable. */
export const TIME_STEP_MIN = 30

/**
 * Every clock the window can start or end at.
 *
 * A whole day of them, not just the recorded hours. That is a change of meaning
 * forced by the date fields: a clock on its own used to identify a moment in the
 * recording, so offering only recorded hours was what kept a chosen window from
 * coming back empty — but paired with a date it is a time *of day*, and a list
 * that stopped at the recording's last hour could not express "from midnight" on
 * the second day of a two-day window.
 *
 * Half-hourly rather than one per recorded fix. At the file's five-minute
 * interval a whole day is 288 options, which is not a list anyone reads — and
 * lining each one up with a fix bought nothing once the playhead became a clock
 * rather than an index into a track. Choosing the minute is the scrub bar's job;
 * this picks the hour to start at.
 */
export const selectReplayTimes = createSelector([selectRaw], (data): string[] => {
  if (!data) return []
  const stepMs = TIME_STEP_MIN * 60_000
  const out: string[] = []
  for (let t = 0; t < DAY_MS; t += stepMs) out.push(hhmmUtc(t))
  return out
})

/**
 * The stretch of recording being replayed, composed from the four fields.
 *
 * A date and a clock make one end. Each half falls back rather than refusing:
 * a date with no clock means the whole of that day, a clock with no date means
 * the recorded day, and one date given alone stands for both ends — so picking
 * 03 Aug and nothing else is one day, all of it, which is also what the screen
 * opens in when nothing at all is chosen.
 *
 * Because the two ends carry their own dates, midnight needs no special case:
 * `03 Aug 13:00` to `04 Aug 14:00` is one 25-hour window, and the fraction the
 * playhead runs on spans it as it spans any other.
 *
 * A window given backwards, or longer than the limit, is reported as a fault
 * rather than quietly corrected. Swapping the two ends round was the old
 * behaviour and it was a guess: an operator who has 04 Aug in the "from" field
 * may have meant to move the start forward or the end back, and those are
 * different windows. Saying so costs one click and cannot be wrong.
 *
 * What the recording covers is reported beside the window, never substituted
 * for it — see `coveredFromMs`.
 */
export const selectPlaybackWindow = createSelector(
  [selectRaw, selectFromDate, selectToDate, selectFromTime, selectToTime],
  (data, fromDate, toDate, fromTime, toTime): PlaybackWindow | null => {
    if (!data) return null
    const dayFromMs = Date.parse(data.from)
    const dayToMs = Date.parse(data.to)

    /**
     * The window stands as asked; what the recording covers is reported beside
     * it rather than put in its place.
     *
     * Nothing is clamped here any more. Replacing an out-of-range window with
     * the recording kept the replay from being empty, but it did so by showing a
     * different window than the one chosen — the scrub bar, both end clocks and
     * the timeline all read hours the operator never asked for, with no way to
     * tell that from a working replay. An empty window is a fact about the
     * archive, and the screen says it.
     */
    /** Midnight of the day the archive was recorded on, to measure shifts from. */
    const archiveMidnight = midnightMs(data.day) ?? dayFromMs

    const finish = (fromMs: number, toMs: number, shiftDays = 0): PlaybackWindow => {
      const fault: WindowFault | null =
        toMs <= fromMs ? 'backwards' : toMs - fromMs > MAX_WINDOW_MS ? 'too-long' : null
      /**
       * Where the archive lies for *this* window.
       *
       * Shifted whole days, so it keeps its time of day: the recorded run moved
       * to another date rather than stretched over it. Every coverage judgement
       * below is made against these, because this is what will actually be
       * replayed — measuring against the unshifted archive would report every
       * date but one as empty when none of them is.
       */
      const shiftMs = shiftDays * DAY_MS
      const openMs = dayFromMs + shiftMs
      const closeMs = dayToMs + shiftMs
      const coveredFrom = Math.max(fromMs, openMs)
      const coveredTo = Math.min(toMs, closeMs)
      const covered = !fault && coveredFrom < coveredTo
      return {
        fromMs,
        toMs,
        dayFromMs: openMs,
        dayToMs: closeMs,
        coveredFromMs: covered ? coveredFrom : null,
        coveredToMs: covered ? coveredTo : null,
        trimmed: fromMs !== openMs || toMs !== closeMs,
        // A faulted window is not applied, so it neither covers nor misses the
        // archive — reporting it as "outside" would put a second, misleading
        // notice beside the one that says what is actually wrong.
        partial: covered && (fromMs < openMs || toMs > closeMs),
        outside: !fault && !covered,
        multiDay: ymdUtc(fromMs) !== ymdUtc(toMs),
        shiftDays,
        fault,
      }
    }

    // Nothing chosen: the archive on its own date, and `trimmed` false so no
    // reset control is offered for a window nobody set.
    if (!fromDate && !toDate && !fromTime && !toTime) return finish(dayFromMs, dayToMs)

    // One date given alone stands for both ends, so choosing a day is choosing
    // that day rather than that day onwards.
    const startDay = midnightMs(fromDate || toDate || data.day)
    const endDay = midnightMs(toDate || fromDate || data.day)
    if (startDay == null || endDay == null) return finish(dayFromMs, dayToMs)

    // An unset clock takes the edge of its own day: midnight at the start, and
    // the last instant at the end, so "03 Aug to 04 Aug" includes all of the 4th.
    const startClock = fromTime ? clockMs(fromTime) : 0
    const endClock = toTime ? clockMs(toTime) : DAY_MS - 1

    /**
     * The archive follows the window's *start* date.
     *
     * One date, because there is one recorded day: a two-day window therefore
     * has traffic on its first day and none on its second, which the `partial`
     * notice states. Repeating the run on both dates would fill the gap, at the
     * cost of sailing every ship back out to sea at midnight to arrive a second
     * time — a worse answer than an honest half-empty window.
     */
    const shiftDays = Math.round((startDay - archiveMidnight) / DAY_MS)

    // Composed in the order given, both halves of both ends. Nothing is put
    // back into order here: a window whose end is not after its start is a
    // fault, which `finish` detects and the screen reports.
    return finish(startDay + (startClock ?? 0), endDay + (endClock ?? DAY_MS - 1), shiftDays)
  },
)

/**
 * The recording cut down to the window, carrying the window as its own span.
 *
 * `from` and `to` are the window's ends rather than the first and last fix left
 * in it, and that is what makes the rest of the screen work: everything reads
 * the replayed span off this object — the transport scales real time by it, the
 * scrub bar spans it, and `playheadMs` turns a scrub position into a clock
 * against it. So a window reaching past the recording is a longer replay with
 * fewer fixes in it, which is the truth, instead of the same few fixes
 * relabelled with hours nobody chose.
 *
 * Untrimmed it hands back the original object, so nothing re-renders for a
 * window nobody set — and a faulted window is not applied at all, which is what
 * makes it safe for the screen to report the fault and leave the replay running
 * on whatever was last valid.
 */
export const selectWindowedPlayback = createSelector(
  [selectRaw, selectPlaybackWindow],
  (data, window): PlaybackData | null => {
    if (!data || !window || window.fault) return data
    const shiftMs = window.shiftDays * DAY_MS
    if (!shiftMs && !window.trimmed) return data

    // Shifted onto the replayed date first, then cut to the window — in that
    // order, because the window is in the replayed date's terms and the fixes
    // are still in the archive's.
    const vessels = data.vessels.map((v) => ({
      ...v,
      track: v.track
        .map((s) =>
          shiftMs ? { ...s, at: new Date(Date.parse(s.at) + shiftMs).toISOString() } : s,
        )
        .filter((s) => {
          const t = Date.parse(s.at)
          return t >= window.fromMs && t <= window.toMs
        }),
    }))
    return {
      ...data,
      day: ymdUtc(window.fromMs),
      from: new Date(window.fromMs).toISOString(),
      to: new Date(window.toMs).toISOString(),
      samples: vessels.reduce((most, v) => Math.max(most, v.track.length), 0),
      vessels,
    }
  },
)
