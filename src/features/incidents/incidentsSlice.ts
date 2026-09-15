import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

/**
 * Incidents do not arrive with the dataset — they happen. The geofences in
 * `geofences.json` are the register of what *can* be reported; this slice
 * decides what has actually been raised, so a fence stays off the map until
 * the VTS operator is told about it.
 */

/** Earliest a fence may break, measured from when the console came up. */
export const INCIDENT_MIN_DELAY_MS = 60_000
/** Random spread on top, so the incident does not land on the same beat twice. */
export const INCIDENT_JITTER_MS = 45_000

interface IncidentsState {
  /** Geofence ids that have been reported, and so are live on the map. */
  raised: string[]
}

const initialState: IncidentsState = {
  raised: [],
}

const incidentsSlice = createSlice({
  name: 'incidents',
  initialState,
  reducers: {
    /**
     * Reports a geofence, putting it live on the map.
     *
     * It no longer raises a toast of its own: a declared zone is a standing
     * condition an operator reads off the chart, and the one notification slot
     * belongs to the thing that needs acting on this minute — a vessel dragging
     * across the anchorage. The fence still shows, and the dashboard still
     * counts who is inside it.
     */
    raiseGeofence(state, action: PayloadAction<string>) {
      if (state.raised.includes(action.payload)) return
      state.raised.push(action.payload)
    },
  },
})

export const { raiseGeofence } = incidentsSlice.actions
export default incidentsSlice.reducer
