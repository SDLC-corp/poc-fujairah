import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { PlaybackData } from '../../types/playback'

export const PLAYBACK_SPEEDS = [2, 3, 4, 8, 16] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

interface PlaybackState {
  /**
   * The vessel in the foreground: the one the timeline lists, the camera frames
   * and the transport steps by. Always a member of `followIds`.
   */
  vesselId: string | null
  /**
   * Every vessel whose track is drawn. Several can be followed at once — the
   * question a replay is usually asked is how two ships passed each other, and
   * one track at a time cannot answer it. One of them is still the subject,
   * because the clock has to step by somebody's fixes and the timeline has to
   * be a list of one ship's day.
   */
  followIds: string[]
  playing: boolean
  /** Multiple of real time. */
  speed: PlaybackSpeed
  /** Scrub position along the track, 0–1. */
  progress: number
  /**
   * The window to replay, as a date on each end and a clock on each end.
   *
   * Four fields rather than a day plus two times, because an incident does not
   * agree to happen inside one calendar day. The two halves compose: the date
   * says which day each end falls on and the clock says where in it, so
   * `03 Aug` + `13:00` → `04 Aug` + `14:00` is one continuous 25-hour window
   * and needs no special case for the midnight it crosses.
   *
   * All four are `YYYY-MM-DD` / `HH:MM` UTC, and all four are null for "not
   * chosen". Null rather than the recording's own bounds on purpose: "not
   * chosen" and "chosen, and it happens to be the whole recording" are
   * different states, and only the first should quietly follow a file whose
   * span changes. Nothing chosen means one day, all of it.
   */
  fromDate: string | null
  toDate: string | null
  fromTime: string | null
  toTime: string | null
  /** The recorded day, fetched on demand — it is far larger than the snapshot. */
  data: PlaybackData | null
  status: 'idle' | 'loading' | 'ready' | 'failed'
  error: string | null
}

/** Pulled lazily: only the playback screen needs a quarter-megabyte of history. */
export const loadPlayback = createAsyncThunk('playback/load', async (): Promise<PlaybackData> => {
  const res = await fetch(`${import.meta.env.BASE_URL}data/playback.json`)
  if (!res.ok) throw new Error(`playback.json → HTTP ${res.status}`)
  return (await res.json()) as PlaybackData
})

const initialState: PlaybackState = {
  vesselId: null,
  followIds: [],
  playing: false,
  speed: 4,
  progress: 0,
  fromDate: null,
  toDate: null,
  fromTime: null,
  toTime: null,
  data: null,
  status: 'idle',
  error: null,
}

const playbackSlice = createSlice({
  name: 'playback',
  initialState,
  reducers: {
    /**
     * Every vessel in the file shares one timeline, so following a different
     * one is a change of subject, not of time: the clock keeps running and the
     * playhead stays where it was.
     */
    setPlaybackVessel(state, action: PayloadAction<string | null>) {
      state.vesselId = action.payload
      // Bringing a vessel to the front necessarily follows her.
      if (action.payload && !state.followIds.includes(action.payload)) {
        state.followIds.push(action.payload)
      }
    },

    /**
     * Add or drop a vessel from the followed set.
     *
     * Dropping the one in front hands the foreground to whoever is left, rather
     * than emptying the timeline — and the last vessel cannot be dropped at
     * all, because a replay following nobody has no clock to run on.
     */
    toggleFollow(state, action: PayloadAction<string>) {
      const id = action.payload
      if (state.followIds.includes(id)) {
        if (state.followIds.length === 1) return
        state.followIds = state.followIds.filter((v) => v !== id)
        if (state.vesselId === id) state.vesselId = state.followIds[0] ?? null
      } else {
        state.followIds.push(id)
      }
    },

    setFollowIds(state, action: PayloadAction<string[]>) {
      state.followIds = action.payload
      if (!action.payload.length) {
        state.vesselId = null
      } else if (!state.vesselId || !action.payload.includes(state.vesselId)) {
        state.vesselId = action.payload[0]
      }
    },
    play(state) {
      // Pressing play at the end replays from the start rather than sitting there.
      if (state.progress >= 1) state.progress = 0
      state.playing = true
    },
    pause(state) {
      state.playing = false
    },
    togglePlay(state) {
      if (!state.playing && state.progress >= 1) state.progress = 0
      state.playing = !state.playing
    },
    setProgress(state, action: PayloadAction<number>) {
      state.progress = Math.min(1, Math.max(0, action.payload))
      if (state.progress >= 1) state.playing = false
    },
    /** Scrubbing by hand takes over from the transport. */
    scrub(state, action: PayloadAction<number>) {
      state.progress = Math.min(1, Math.max(0, action.payload))
      state.playing = false
    },
    setSpeed(state, action: PayloadAction<PlaybackSpeed>) {
      state.speed = action.payload
    },
    rewind(state) {
      state.progress = 0
      state.playing = false
    },
    /** Stop: halt and return to the start of the day. */
    stop(state) {
      state.playing = false
      state.progress = 0
    },
    /** Nudge the playhead by a fraction of the track, pausing as it goes. */
    step(state, action: PayloadAction<number>) {
      state.playing = false
      state.progress = Math.min(1, Math.max(0, state.progress + action.payload))
    },
    /**
     * Move one end of the replay window — either date, either clock.
     *
     * Each field is applied only when the payload carries its key, so a change
     * of date does not silently reset a clock the operator has already set.
     *
     * The playhead goes back to the start and the transport stops, because
     * progress is a fraction of the window: leaving it where it was would jump
     * the replay to an unrelated moment the instant the window changed.
     */
    setPlaybackWindow(
      state,
      action: PayloadAction<{
        fromDate?: string | null
        toDate?: string | null
        from?: string | null
        to?: string | null
      }>,
    ) {
      const p = action.payload
      if ('fromDate' in p) state.fromDate = p.fromDate || null
      if ('toDate' in p) state.toDate = p.toDate || null
      if ('from' in p) state.fromTime = p.from || null
      if ('to' in p) state.toTime = p.to || null
      state.progress = 0
      state.playing = false
    },

    /** Back to one day, all of it — the state the screen opens in. */
    clearPlaybackWindow(state) {
      state.fromDate = null
      state.toDate = null
      state.fromTime = null
      state.toTime = null
      state.progress = 0
      state.playing = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadPlayback.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loadPlayback.fulfilled, (state, action) => {
        state.status = 'ready'
        state.data = action.payload
        /**
         * Open on today, at the hours the traffic actually runs at.
         *
         * Today because the archive's own date is an implementation detail the
         * operator should not have to know — it is projected onto whatever date
         * is chosen, so there is no reason for the screen to open on a date in
         * the past. The archive's own clock hours rather than the wall clock
         * because the recorded run covers part of a day: opening at "now" lands
         * outside it more often than in it, and a replay that starts on an empty
         * window is a worse first impression than one that starts on the
         * movement. Only when nothing has been chosen, so it never overrides the
         * operator.
         */
        if (!state.fromDate && !state.toDate && !state.fromTime && !state.toTime) {
          state.fromDate = new Date().toISOString().slice(0, 10)
          state.fromTime = action.payload.from.slice(11, 16)
          state.toTime = action.payload.to.slice(11, 16)
        }
        // Default to the first recorded vessel so the screen opens populated.
        state.vesselId = state.vesselId ?? action.payload.vessels[0]?.id ?? null
        if (!state.followIds.length && state.vesselId) state.followIds = [state.vesselId]
      })
      .addCase(loadPlayback.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message ?? 'Failed to load playback data'
      })
  },
})

export const {
  setPlaybackVessel,
  toggleFollow,
  setFollowIds,
  play,
  pause,
  togglePlay,
  setProgress,
  scrub,
  setSpeed,
  rewind,
  stop,
  step,
  setPlaybackWindow,
  clearPlaybackWindow,
} = playbackSlice.actions
export default playbackSlice.reducer
