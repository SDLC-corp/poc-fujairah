import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  loadPlayback,
  PLAYBACK_SPEEDS,
  scrub,
  setDate,
  setPlaybackVessel,
  setProgress,
  setSpeed,
  step,
  stop,
  togglePlay,
} from '../../features/playback/playbackSlice'
import type { PlaybackSpeed } from '../../features/playback/playbackSlice'
import { sampleAt } from '../../utils/playbackTrack'
import { clearSelection, selectFeature } from '../../features/selection/selectionSlice'
import { flagName } from '../../utils/flags'
import { VESSEL_COLORS, VESSEL_LABELS, VESSEL_STATUS_SHORT } from '../../map/vesselTypes'
import type { VesselStatus } from '../../map/vesselTypes'
import type { VesselType } from '../../types/gis'
import MapView from '../MapView'
import MapFocusControl from '../MapFocusControl'

/** Wall-clock seconds one replayed hour takes at 1x. */
const REAL_SECONDS_PER_HOUR = 60

export default function PlaybackScreen() {
  const dispatch = useAppDispatch()
  const { vesselId, playing, speed, progress, date, data, status, error } = useAppSelector(
    (s) => s.playback,
  )
  const [showRaw, setShowRaw] = useState(false)
  const selected = useAppSelector((s) => s.selection.selected)

  useEffect(() => {
    if (status === 'idle') dispatch(loadPlayback())
  }, [status, dispatch])

  const fleet = data?.vessels ?? []
  const vessel = fleet.find((v) => v.id === vesselId) ?? fleet[0] ?? null

  /* Selecting the followed vessel lights the map's own halo and detail card. */
  const followId = vessel?.id
  useEffect(() => {
    if (followId) dispatch(selectFeature({ layer: 'vessels', id: followId }))
  }, [followId, dispatch])
  const here = vessel ? sampleAt(vessel.track, progress) : null

  /** Replayed hours in the file, used to scale the transport against real time. */
  const spanHours = data ? (Date.parse(data.to) - Date.parse(data.from)) / 3600_000 : 6

  /* Transport: advance in real time, scaled by the speed multiplier. */
  const frameRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)
  useEffect(() => {
    if (!playing || !vessel) return
    lastTickRef.current = performance.now()

    const tick = (now: number) => {
      const deltaS = (now - lastTickRef.current) / 1000
      lastTickRef.current = now
      dispatch(setProgress(progress + (deltaS * speed) / (spanHours * REAL_SECONDS_PER_HOUR)))
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [playing, speed, vessel, spanHours, dispatch, progress])

  /** The file is UTC, and so is the port's operating clock here. */
  const clock = (iso?: string) => (iso ? `${new Date(iso).toISOString().slice(11, 16)}Z` : '—')

  /** The card is shown for whichever ship is selected — from the list or the map. */
  const detailFor =
    selected?.layer === 'vessels' ? (fleet.find((v) => v.id === selected.id) ?? null) : null
  const detailFix = detailFor ? sampleAt(detailFor.track, progress) : null

  /** One nudge = one recorded fix. */
  const STEP = vessel && vessel.track.length > 1 ? 1 / (vessel.track.length - 1) : 0.01
  const movingNow = fleet.filter((v) => sampleAt(v.track, progress)?.status === 'underway').length

  return (
    <div className="playback-layout">
      {/* ---------- the map owns the whole area ---------- */}
      <div className="playback-map">
        <MapView />
        <MapFocusControl />

        {status === 'loading' && <div className="pb-state">Loading recorded day…</div>}
        {status === 'failed' && <div className="pb-state pb-state-bad">{error}</div>}

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
                onClick={() => dispatch(clearSelection())}
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
          <select
            className="pb-select"
            aria-label="Vessel"
            value={vessel?.id ?? ''}
            onChange={(e) => dispatch(setPlaybackVessel(e.target.value))}
          >
            {fleet.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.movement === 'arrival' ? '↓' : '↑'} {v.area}
              </option>
            ))}
          </select>
          <input
            className="pb-select pb-date"
            type="date"
            aria-label="Replay date"
            value={date}
            min={data?.day ?? date}
            max={data?.day ?? date}
            onChange={(e) => dispatch(setDate(e.target.value || date))}
          />
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
          <span className="pb-clock">{clock(data?.from)}</span>
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
          <span className="pb-clock">{clock(data?.to)}</span>
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
            {movingNow}/{fleet.length} under way
          </span>
          <button
            type="button"
            className={`filter-chip chip-labelled${showRaw ? ' active' : ''}`}
            onClick={() => setShowRaw((v) => !v)}
          >
            Raw
          </button>
        </div>
      </div>
    </div>
  )
}
