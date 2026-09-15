import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  loadPlayback,
  PLAYBACK_SPEEDS,
  scrub,
  setDate,
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
import { sampleAt } from '../../utils/playbackTrack'
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
  selectPlaybackWindow,
  selectReplayTimes,
  selectWindowedPlayback,
} from '../../features/playback/selectors'

/** Wall-clock seconds one replayed hour takes at 1x. */
const REAL_SECONDS_PER_HOUR = 60

export default function PlaybackScreen() {
  const dispatch = useAppDispatch()
  const { vesselId, followIds, playing, speed, progress, date, fromTime, toTime, status, error } =
    useAppSelector((s) => s.playback)
  // Everything on this screen reads the windowed day; the raw file is only
  // needed for the bounds the pickers are allowed to offer.
  const data = useAppSelector(selectWindowedPlayback)
  const replayWindow = useAppSelector(selectPlaybackWindow)
  const replayTimes = useAppSelector(selectReplayTimes)
  /** What the file actually covers — the only times worth offering. */
  const recorded = replayWindow
    ? { from: hhmmUtc(replayWindow.dayFromMs), to: hhmmUtc(replayWindow.dayToMs) }
    : null
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
  const here = vessel ? sampleAt(vessel.track, progress) : null

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
  /** Nothing to run through: a window can leave the subject with one fix or none. */
  const canPlay = Boolean(vessel && vessel.track.length > 1)

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
  const clock = (iso?: string) => (iso ? `${new Date(iso).toISOString().slice(11, 16)}Z` : '—')

  /**
   * The card is shown for whichever ship was *clicked* — on the map or in the
   * list. A vessel the replay merely follows is haloed, not opened.
   */
  const detailFor =
    cardOpen && selected?.layer === 'vessels'
      ? (fleet.find((v) => v.id === selected.id) ?? null)
      : null
  const detailFix = detailFor ? sampleAt(detailFor.track, progress) : null

  /** One nudge = one recorded fix. */
  const STEP = vessel && vessel.track.length > 1 ? 1 / (vessel.track.length - 1) : 0.01
  const movingNow = fleet.filter((v) => sampleAt(v.track, progress)?.status === 'underway').length

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

        {status === 'loading' && <div className="pb-state">Loading recorded day…</div>}
        {status === 'failed' && <div className="pb-state pb-state-bad">{error}</div>}

        {/* Silence here was the bug: a window outside the recording emptied
            every track, and the screen simply did nothing when play was
            pressed. Now it says what happened and what is being replayed. */}
        {status === 'ready' && recorded && replayWindow?.outside && (
          <div className="pb-state pb-state-warn">
            Nothing was recorded in those hours — this file covers {recorded.from} to{' '}
            {recorded.to} UTC. Replaying all of it.
          </div>
        )}
        {status === 'ready' && recorded && replayWindow?.clamped && (
          <div className="pb-state pb-state-warn">
            Held inside the recording ({recorded.from}–{recorded.to} UTC): replaying{' '}
            {hhmmUtc(replayWindow.fromMs)}–{hhmmUtc(replayWindow.toMs)}.
          </div>
        )}

        {showTimeline && followed.length > 0 && data && (
          <PlaybackTimeline
            vessels={followed}
            primaryId={vessel?.id ?? null}
            day={data.day}
            playheadAt={here?.at ?? null}
            // A fix is a point on the track, so the playhead lands exactly on it
            // rather than somewhere between two. Every vessel in the file shares
            // one sampling grid, so a row's index maps straight to the clock.
            onPick={(vesselId, i) => {
              const target = followed.find((v) => v.id === vesselId)
              if (!target) return
              dispatch(scrub(i / Math.max(1, target.track.length - 1)))
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
          <input
            className="pb-select pb-date"
            type="date"
            aria-label="Replay date"
            value={date}
            min={data?.day ?? date}
            max={data?.day ?? date}
            onChange={(e) => dispatch(setDate(e.target.value || date))}
          />

          {/* Left empty, the replay is the whole recording — which is what it
              was before this existed, so the default costs nothing. The bounds
              are on the inputs because the file is six hours, not a day, and a
              picker that offers 03:00 is offering an empty replay. */}
          {/* A div, not a label: a label owns one control, and forwarding every
              click in here to whichever input came first is not what any of
              these three want. Each carries its own aria-label instead. */}
          <div
            className="pb-window"
            title={
              recorded
                ? `Replay part of the recording. It covers ${recorded.from} to ${recorded.to} UTC.`
                : 'Replay only part of the day'
            }
          >
            <ReplayTimeField
              label="Replay from"
              value={fromTime}
              options={replayTimes}
              placeholder={recorded ? `Start ${recorded.from}` : 'Start'}
              onCommit={(from) => dispatch(setPlaybackWindow({ from }))}
            />
            <span aria-hidden="true">→</span>
            <ReplayTimeField
              label="Replay to"
              value={toTime}
              options={replayTimes}
              placeholder={recorded ? `End ${recorded.to}` : 'End'}
              onCommit={(to) => dispatch(setPlaybackWindow({ to }))}
            />
            {replayWindow?.trimmed ? (
              <button
                type="button"
                className="link-cell pb-window-reset"
                title="Replay the whole recording"
                onClick={() => dispatch(clearPlaybackWindow())}
              >
                Full day
              </button>
            ) : (
              <span className="muted pb-window-note">
                {recorded ? `${recorded.from}–${recorded.to}` : 'full day'}
              </span>
            )}
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
            title={canPlay ? undefined : 'No run to play in these hours'}
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
          <span className="pb-clock">
            {replayWindow ? `${hhmmUtc(replayWindow.fromMs)}Z` : '—'}
          </span>
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
          <span className="pb-clock">
            {replayWindow ? `${hhmmUtc(replayWindow.toMs)}Z` : '—'}
          </span>
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
          <span className="pb-now">{clock(here?.at)}</span>
          <span className="muted">{here ? `${here.speedKn} kn · ${here.headingDeg}°` : '—'}</span>
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
