import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export interface Transit {
  vesselId: string
  name: string
  from: [number, number]
  to: [number, number]
  /** Waypoints from the waiting position, via the Passage Way, to the spot. */
  path: [number, number][]
  spotId: string
  areaCode: string
  /** Epoch ms the move began — the animation clock reads from this. */
  startedAt: number
  durationMs: number
}

export interface Arrival {
  vesselId: string
  name: string
  areaCode: string
  spotId: string
  at: [number, number]
}

interface TransitState {
  /** At most one vessel is walked to its spot at a time. */
  active: Transit | null
  arrived: Arrival | null
}

const initialState: TransitState = { active: null, arrived: null }

const transitSlice = createSlice({
  name: 'transit',
  initialState,
  reducers: {
    startTransit(state, action: PayloadAction<Omit<Transit, 'startedAt' | 'durationMs'>>) {
      state.arrived = null
      state.active = { ...action.payload, startedAt: Date.now(), durationMs: 6000 }
    },
    finishTransit(state) {
      if (!state.active) return
      const { vesselId, name, areaCode, spotId, to } = state.active
      state.arrived = { vesselId, name, areaCode, spotId, at: to }
      state.active = null
    },
    dismissArrival(state) {
      state.arrived = null
    },
  },
})

export const { startTransit, finishTransit, dismissArrival } = transitSlice.actions
export default transitSlice.reducer
