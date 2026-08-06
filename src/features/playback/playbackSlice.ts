import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { PlaybackData } from '../../types/playback'

export const PLAYBACK_SPEEDS = [2, 3, 4, 8, 16] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]

interface PlaybackState {
  /** Vessel whose approach is being replayed. */
  vesselId: string | null
  playing: boolean
  /** Multiple of real time. */
  speed: PlaybackSpeed
  /** Scrub position along the track, 0–1. */
  progress: number
  /** Replay day, YYYY-MM-DD. Only day one carries data in this PoC. */
  date: string
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

/** The single day of history the PoC ships with. */
export const PLAYBACK_DAY = '2026-08-03'

const initialState: PlaybackState = {
  vesselId: null,
  playing: false,
  speed: 4,
  progress: 0,
  date: PLAYBACK_DAY,
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
    setDate(state, action: PayloadAction<string>) {
      state.date = action.payload
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
        state.date = action.payload.day
        // Default to the first recorded vessel so the screen opens populated.
        state.vesselId = state.vesselId ?? action.payload.vessels[0]?.id ?? null
      })
      .addCase(loadPlayback.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message ?? 'Failed to load playback data'
      })
  },
})

export const {
  setPlaybackVessel,
  play,
  pause,
  togglePlay,
  setProgress,
  scrub,
  setSpeed,
  rewind,
  stop,
  step,
  setDate,
} = playbackSlice.actions
export default playbackSlice.reducer
