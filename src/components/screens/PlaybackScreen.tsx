import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  loadPlayback,
  PLAYBACK_SPEEDS,
  scrub,
  setPlaybackWindow,
  clearPlaybackWindow,
  setPlaybackVessel,
  setProgress,
  setSpeed,
  step,
  stop,
  togglePlay,
} from '../../features/playback/playbackSlice'
import type { PlaybackSpeed } from '../../features/playback/playbackSlice'
import { playheadMs, sampleAtTime } from '../../utils/playbackTrack'
import { closeCard, highlightFeature } from '../../features/selection/selectionSlice'
import { flagName } from '../../utils/flags'
import { VESSEL_COLORS, VESSEL_LABELS, VESSEL_STATUS_SHORT } from '../../map/vesselTypes'
import type { VesselStatus } from '../../map/vesselTypes'
import type { VesselType } from '../../types/gis'
import MapView from '../MapView'
import MapFocusControl from '../MapFocusControl'
import MapFullscreen from '../MapFullscreen'
import PlaybackTimeline from '../PlaybackTimeline'
import PlaybackFollowPicker from '../PlaybackFollowPicker'
import ReplayTimeField from '../ReplayTimeField'
import {
  hhmmUtc,
  MAX_WINDOW_DAYS,
  selectPlaybackWindow,
  selectReplayTimes,
  selectWindowedPlayback,
  shiftDay,
  stampUtc,
} from '../../features/playback/selectors'

/** Wall-clock seconds one replayed hour takes at 1x. */
const REAL_SECONDS_PER_HOUR = 60

/** "2026-08-03" -> "03 Aug 2026". */
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

export default function PlaybackScreen() {
  const dispatch = useAppDispatch()
  const {
    vesselId,
    followIds,
    playing,
    speed,
    progress,
    fromDate,
    toDate,
    fromTime,
    toTime,
    status,
    error,
  } = useAppSelector((s) => s.playback)
  // Everything on this screen reads the windowed day; the raw file is only
  // needed for the bounds the pickers are allowed to offer.
  const data = useAppSelector(selectWindowedPlayback)
  const replayWindow = useAppSelector(selectPlaybackWindow)
  /** The date the archive was actually recorded on, for the projection notice. */
  const archiveDay = useAppSelector((s) => s.playback.data?.day ?? null)
  const replayTimes = useAppSelector(selectReplayTimes)
  /**
   * What the file actually covers, as full stamps.
   *
   * Dated rather than bare clocks now that the window can span days: telling an
   * operator who asked for the 4th that "this file covers 12:00 to 18:00" does
   * not tell them the thing they got wrong, which was the day.
   */
  const recorded = replayWindow
    ? { from: stampUtc(replayWindow.dayFromMs), to: stampUtc(replayWindow.dayToMs) }
    : null
  /**
   * How a moment is written on this screen.
   *
   * Inside one day a clock is unambiguous and the date is noise. Across two, the
   * date is the half that says which `14:00` is meant — so it appears exactly
   * when it carries information.
   */
  const multiDay = replayWindow?.multiDay ?? false
  const stamp = (ms: number) => (multiDay ? stampUtc(ms) : `${hhmmUtc(ms)}Z`)

  /**
   * What is wrong with the chosen window, in the operator's terms.
   *
   * A faulted window is not applied, so this is the whole of what the pickers
   * report: there is no half-honoured range to explain as well.
   */
  const fault = replayWindow?.fault ?? null
  const faultText =
    fault === 'backwards'
      ? 'The end must be after the start.'
      : fault === 'too-long'
        ? `A window can cover at most ${MAX_WINDOW_DAYS} days.`
        : null
  /**
   * The pickers are bounded against each other, so the common way of hitting
   * either rule is simply not offered: the end cannot precede the start, and
   * neither end can be more than a day from the other. Typed input can still
   * break both — a date field accepts digits whatever its bounds say — which is
   * why the selector validates as well rather than trusting these.
   */
  const dateBounds = {
    fromMin: toDate ? shiftDay(toDate, -(MAX_WINDOW_DAYS - 1)) : undefined,
    fromMax: toDate ?? undefined,
    toMin: fromDate ?? undefined,
    toMax: fromDate ? shiftDay(fromDate, MAX_WINDOW_DAYS - 1) : undefined,
  }
  const [showRaw, setShowRaw] = useState(false)
  const [showTimeline, setShowTimeline] = useState(true)
  const selected = useAppSelector((s) => s.selection.selected)
  const cardOpen = useAppSelector((s) => s.selection.cardOpen)
  const mapFullscreen = useAppSelector((s) => s.ui.mapFullscreen)

  useEffect(() => {
    if (status === 'idle') dispatch(loadPlayback())
  }, [status, dispatch])

  const fleet = data?.vessels ?? []
  const vessel = fleet.find((v) => v.id === vesselId) ?? fleet[0] ?? null
  /** In the picker's order, so the timeline's filter chips match the dropdown. */
  const followed = fleet.filter((v) => followIds.includes(v.id))

  /**
   * The followed vessel is lit on the map, but not opened.
   *
   * The replay picks a subject on its own — the first ship in the file, or
   * whichever the picker last brought to the front — and that is a good reason
   * to halo her on the chart, but not to put a details card over it. The card
   * is something the operator opens by clicking, here as everywhere else.
   */
  const followId = vessel?.id
  useEffect(() => {
    if (followId) dispatch(highlightFeature({ layer: 'vessels', id: followId }))
  }, [followId, dispatch])
  /**
   * The moment the playhead is at, which is the replay's clock.
   *
   * Taken from the window rather than from the subject's track, so it keeps
   * time through hours the archive has no fixes for instead of stalling on the
   * last one it found. `here` is then what she was last reported doing at that
   * moment — null before her first fix in the window, which is how a vessel
   * stays off the chart until she was actually seen.
   */
  const atMs = data ? playheadMs(data, progress) : null
  const here = vessel && atMs != null ? sampleAtTime(vessel.track, atMs) : null

  /**
   * Replayed hours, used to scale the transport against real time.
   *
   * Floored, because it is a divisor: a degenerate window would otherwise put a
   * zero under the division and hand the playhead Infinity or NaN, and a NaN
   * progress never reaches 1, so the replay would run for ever going nowhere.
   */
  const spanHours = Math.max(
    0.05,
    data ? (Date.parse(data.to) - Date.parse(data.from)) / 3600_000 : 6,
  )
  /**
   * Nothing to run through: a window can leave the subject with one fix or
   * none, and a faulted one is not a window to run at all.
   */
  const canPlay = !fault && Boolean(vessel && vessel.track.length > 1)

  /**
   * Transport: advance in real time, scaled by the speed multiplier.
   *
   * The playhead is read from a ref rather than from the render, so this effect
   * is created once per press of play instead of being torn down and rebuilt on
   * every frame it produces. That rebuild was the bug behind a replay that sat
   * still: elapsed time was measured from the moment the effect re-ran to the
   * next frame, not from one frame to the next, so the heavier the render the
   * smaller the measured step — and past a certain weight the playhead advanced
   * by effectively nothing each time round. Frame-to-frame cannot do that: the
   * clock is the browser's, and it has no opinion about how long the render
   * took.
   */
  const progressRef = useRef(progress)
  progressRef.current = progress
  useEffect(() => {
    if (!playing || !canPlay) return
    let last = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const deltaS = (now - last) / 1000
      last = now
      dispatch(
        setProgress(progressRef.current + (deltaS * speed) / (spanHours * REAL_SECONDS_PER_HOUR)),
      )
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, canPlay, spanHours, dispatch])

  /** The file is UTC, and so is the port's operating clock here. */
  const clock = (iso?: string) => (iso ? stamp(Date.parse(iso)) : '—')

  /**
   * The card is shown for whichever ship was *clicked* — on the map or in the
   * list. A vessel the replay merely follows is haloed, not opened.
   */
  const detailFor =
    cardOpen && selected?.layer === 'vessels'
      ? (fleet.find((v) => v.id === selected.id) ?? null)
      : null
  const detailFix = detailFor && atMs != null ? sampleAtTime(detailFor.track, atMs) : null

  /**
   * One nudge = one sampling interval.
   *
   * Measured in time over the window, not as a fraction of the subject's track:
   * a window wider than the recording has fewer fixes than it has intervals, and
   * stepping by `1 / (fixes - 1)` would jump minutes or hours at a time — or
   * nothing at all when the window holds no fixes to count.
   */
  const windowMs = data ? Date.parse(data.to) - Date.parse(data.from) : 0
  const STEP =
    data && windowMs > 0
      ? Math.min(1, (Math.max(1, data.intervalMinutes) * 60_000) / windowMs)
      : 0.01
  const movingNow =
    atMs == null
      ? 0
      : fleet.filter((v) => sampleAtTime(v.track, atMs)?.status === 'underway').length

  return (
    <div className="playback-layout">
      {/* ---------- the map owns the whole area ---------- */}
      {/* `has-timeline` shifts the map's own top-right controls clear of the
          panel, which otherwise sits straight over the zoom and full-screen. */}
      <div
        className={`playback-map${mapFullscreen ? ' map-expanded' : ''}${
          showTimeline && vessel && data ? ' has-timeline' : ''
        }`}
      >
        <MapView />
        <MapFullscreen />
        <MapFocusControl />

        {/* A column: a projected day and a partly-covered window are both true
            at once, and stacked notices used to land on top of each other. */}
        <div className="pb-states">
        {status === 'loading' && <div className="pb-state">Loading recorded day…</div>}
        {status === 'failed' && <div className="pb-state pb-state-bad">{error}</div>}

        {/* Silence here was the bug: a window outside the recording emptied
            every track, and the screen simply did nothing when play was
            pressed. Now it says what happened and what is being replayed. */}
        {/* The window itself is never altered, so these say what is *in* it
            rather than announcing a substitution. An empty window is a fact
            about the archive and the clock still runs through it; what would be
            wrong is showing different hours and not saying so. */}
        {/* A fault outranks the coverage notices: the window was not applied, so
            what the archive does or does not hold for it is not yet the
            question. */}
        {status === 'ready' && faultText && (
          <div className="pb-state pb-state-bad">
            {faultText} The replay is unchanged until the window is valid.
          </div>
        )}
        {status === 'ready' && recorded && replayWindow?.outside && (
          <div className="pb-state pb-state-warn">
            No positions were recorded in this window. The archive holds {recorded.from} to{' '}
            {recorded.to} UTC.
          </div>
        )}
        {status === 'ready' && replayWindow?.partial && (
          <div className="pb-state pb-state-warn">
            Positions were only recorded for part of this window —{' '}
            {stampUtc(replayWindow.coveredFromMs!)} to {stampUtc(replayWindow.coveredToMs!)} UTC.
          </div>
        )}

        {/* Said plainly and every time. These are real recorded tracks, but
            they are not this date's: the archive holds one day and it is
            re-stamped onto whichever is asked for. A console that answered
            "what happened on the 16th" with another day's movement and did not
            say so would be worse than one that answered nothing. */}
        {status === 'ready' && !fault && archiveDay && replayWindow?.shiftDays !== 0 && (
          <div className="pb-state pb-state-note">
            Demonstration day — these tracks are the {dayLabel(archiveDay)} recording re-stamped
            onto this date, not recorded history for it.
          </div>
        )}
        </div>

        {showTimeline && followed.length > 0 && data && (
          <PlaybackTimeline
            vessels={followed}
            primaryId={vessel?.id ?? null}
            range={
              replayWindow
                ? `${stampUtc(replayWindow.fromMs)} – ${stampUtc(replayWindow.toMs)} UTC`
                : ''
            }
            // The playhead's moment, so the current row is the last event at or
            // before the clock even when there is no fix under it.
            playheadAt={atMs != null ? new Date(atMs).toISOString() : null}
            // A row is picked by its time, not by its index. Progress is a
            // fraction of the window, so the fix's own timestamp is what maps
            // onto it — and it no longer matters whether the vessels share a
            // sampling grid.
            onPick={(at) => {
              if (!windowMs) return
              dispatch(scrub((Date.parse(at) - Date.parse(data.from)) / windowMs))
            }}
            onClose={() => setShowTimeline(false)}
          />
        )}

        {detailFor && detailFix && (
          <aside className="pb-detail">
            <header>
              <span className="dot" style={{ background: VESSEL_COLORS[detailFor.type as VesselType] ?? '#94a3b8' }} />
              <div className="pb-detail-name">
                <strong>{detailFor.name}</strong>
                <span className="muted">
                  IMO {detailFor.imo} · {flagName(detailFor.flag)}
                </span>
              </div>
              <span className={`pill pill-${detailFix.status}`}>
                {VESSEL_STATUS_SHORT[detailFix.status as VesselStatus] ?? detailFix.status}
              </span>
              <button
                type="button"
                className="close"
                aria-label="Close details"
                // Shuts the card, keeps the halo: she is still the ship the
                // replay is following, and dropping that as well would stop
                // the track being drawn for her.
                onClick={() => dispatch(closeCard())}
              >
                ×
              </button>
            </header>

            <div className="pb-detail-body">
              <h4 className="drawer-section">Particulars</h4>
              <dl className="kv">
                <div>
                  <dt>Type</dt>
                  <dd>{VESSEL_LABELS[detailFor.type as VesselType] ?? detailFor.type}</dd>
                </div>
                <div>
                  <dt>LOA</dt>
                  <dd>{detailFor.lengthM} m</dd>
                </div>
                <div>
                  <dt>Beam</dt>
                  <dd>{detailFor.beamM} m</dd>
                </div>
                <div>
                  <dt>Draft</dt>
                  <dd>{detailFor.draftM} m</dd>
                </div>
                <div>
                  <dt>MMSI</dt>
                  <dd>{detailFor.mmsi}</dd>
                </div>
                <div>
                  <dt>Movement</dt>
                  <dd>{detailFor.movement === 'arrival' ? 'Arrival' : 'Departure'}</dd>
                </div>
              </dl>

              <h4 className="drawer-section">At this fix</h4>
              <dl className="kv kv-wide">
                <div>
                  <dt>Time</dt>
                  <dd>{clock(detailFix.at)}</dd>
                </div>
                <div>
                  <dt>Area</dt>
                  <dd>{detailFor.area}</dd>
                </div>
                <div>
                  <dt>Speed</dt>
                  <dd>{detailFix.speedKn} kn</dd>
                </div>
                <div>
                  <dt>Heading</dt>
                  <dd>{detailFix.headingDeg}°</dd>
                </div>
                <div className="kv-span">
                  <dt>Position</dt>
                  <dd>
                    {detailFix.lat.toFixed(5)}°N, {detailFix.lon.toFixed(5)}°E
                  </dd>
                </div>
              </dl>

              {detailFor.id !== vessel?.id && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => dispatch(setPlaybackVessel(detailFor.id))}
                >
                  Follow this vessel
                </button>
              )}

              {showRaw && (
                <>
                  <h4 className="drawer-section">Raw record</h4>
                  <pre className="pb-raw-pre">
                    {JSON.stringify(
                      {
                        id: detailFor.id,
                        imo: detailFor.imo,
                        mmsi: detailFor.mmsi,
                        type: detailFor.type,
                        movement: detailFor.movement,
                        area: detailFor.area,
                        fix: detailFix,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ---------- one control bar across the bottom ---------- */}
      <div className="pb-bar">
        <div className="pb-bar-group">
          <PlaybackFollowPicker fleet={fleet} />

          {/* Date range and time range as two rows, because they answer two
              questions — which days, and which hours of them — and composing
              them is what lets a window cross midnight. Left empty, the replay
              is one day and all of it, which is what the screen did before any
              of this existed, so the default costs nothing.

              The date fields are deliberately unbounded. The file is part of a
              single day, so bounding them to it would forbid expressing exactly
              the range this is for; what the recording covers is enforced
              instead by the clamp, which says on the map what it did and why. */}
          {/* Divs, not labels: a label owns one control, and forwarding every
              click in here to whichever input came first is not what any of
              these want. Each carries its own aria-label instead. */}
          <div
            className="pb-window"
            title={
              recorded
                ? `Replay part of the recording. It covers ${recorded.from} to ${recorded.to} UTC.`
                : 'Replay only part of the recording'
            }
          >
            <div className="pb-range">
              <span className="pb-range-label">Date</span>
              <input
                className={`pb-select pb-date${fault ? ' is-bad' : ''}`}
                type="date"
                aria-label="Replay from date"
                aria-invalid={fault ? true : undefined}
                min={dateBounds.fromMin}
                max={dateBounds.fromMax}
                value={fromDate ?? ''}
                onChange={(e) => dispatch(setPlaybackWindow({ fromDate: e.target.value }))}
              />
              <span aria-hidden="true">→</span>
              <input
                className={`pb-select pb-date${fault ? ' is-bad' : ''}`}
                type="date"
                aria-label="Replay to date"
                aria-invalid={fault ? true : undefined}
                min={dateBounds.toMin}
                max={dateBounds.toMax}
                value={toDate ?? ''}
                onChange={(e) => dispatch(setPlaybackWindow({ toDate: e.target.value }))}
              />
            </div>

            <div className="pb-range">
              <span className="pb-range-label">Time</span>
              <ReplayTimeField
                label="Replay from time"
                value={fromTime}
                options={replayTimes}
                placeholder="00:00"
                onCommit={(from) => dispatch(setPlaybackWindow({ from }))}
              />
              <span aria-hidden="true">→</span>
              <ReplayTimeField
                label="Replay to time"
                value={toTime}
                options={replayTimes}
                placeholder="23:59"
                onCommit={(to) => dispatch(setPlaybackWindow({ to }))}
              />
            </div>

            {/* What is in force — which is the fault when there is one, because
                a faulted window is not applied and printing a range beside the
                reason it was rejected would say it *is*. Dated on both ends
                whenever the window crosses midnight. */}
            <div className="pb-range pb-range-state">
              {faultText ? (
                <span className="pb-window-fault" role="alert">
                  {faultText}
                </span>
              ) : (
                replayWindow && (
                  <span className="muted pb-window-note">
                    {stamp(replayWindow.fromMs)} → {stamp(replayWindow.toMs)}
                  </span>
                )
              )}
              {replayWindow?.trimmed && (
                <button
                  type="button"
                  className="link-cell pb-window-reset"
                  title="Replay the whole recording"
                  onClick={() => dispatch(clearPlaybackWindow())}
                >
                  Full day
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="pb-bar-group pb-transport">
          <button
            type="button"
            aria-label="Step backward"
            title="Step backward"
            onClick={() => dispatch(step(-STEP))}
          >
            ◀◀
          </button>
          <button
            type="button"
            className="pb-play"
            aria-label={playing ? 'Pause' : 'Play'}
            // Off rather than silently doing nothing when the chosen hours hold
            // fewer than two fixes for the vessel in front.
            disabled={!canPlay}
            title={canPlay ? undefined : (faultText ?? 'No run to play in these hours')}
            onClick={() => dispatch(togglePlay())}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            aria-label="Step forward"
            title="Step forward"
            onClick={() => dispatch(step(STEP))}
          >
            ▶▶
          </button>
          <button type="button" aria-label="Stop" title="Stop" onClick={() => dispatch(stop())}>
            ■
          </button>
        </div>

        <div className="pb-bar-group pb-timeline">
          {/* Read from the window rather than from the trimmed file: these two
              labels are the ends of the scrub bar, so they have to be the ends
              of the window itself and cannot be allowed to disagree with the
              pickers above them. */}
          <span className="pb-clock">{replayWindow ? stamp(replayWindow.fromMs) : '—'}</span>
          <input
            className="pb-scrub"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={progress}
            aria-label="Scrub playback"
            onChange={(e) => dispatch(scrub(Number(e.target.value)))}
          />
          <span className="pb-clock">{replayWindow ? stamp(replayWindow.toMs) : '—'}</span>
        </div>

        <div className="pb-bar-group pb-speeds">
          {PLAYBACK_SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              className={`filter-chip chip-labelled${speed === sp ? ' active' : ''}`}
              onClick={() => dispatch(setSpeed(sp as PlaybackSpeed))}
            >
              {sp}×
            </button>
          ))}
        </div>

        {/* Live readout — the record as it stands at the playhead. */}
        <div className="pb-bar-group pb-readout-inline">
          {/* The playhead's own moment, not the last fix's. They are the same
              thing while the archive has data and they are not otherwise, and
              the operator asked the clock to run over the window they chose. */}
          <span className="pb-now" title="Replay clock — the moment the playhead is at">
            {atMs != null ? stamp(atMs) : '—'}
          </span>
          <span className="muted">
            {here ? `${here.speedKn} kn · ${here.headingDeg}°` : 'no fix'}
          </span>
          <span className="muted">
            {followIds.length > 1 && `${followIds.length} followed · `}
            {movingNow}/{fleet.length} under way
          </span>
          <button
            type="button"
            className={`filter-chip chip-labelled${showTimeline ? ' active' : ''}`}
            aria-pressed={showTimeline}
            onClick={() => setShowTimeline((v) => !v)}
          >
            Timeline
          </button>
          <button
            type="button"
            className={`filter-chip chip-labelled${showRaw ? ' active' : ''}`}
            aria-pressed={showRaw}
            onClick={() => setShowRaw((v) => !v)}
          >
            Raw
          </button>
        </div>
      </div>
    </div>
  )
}
