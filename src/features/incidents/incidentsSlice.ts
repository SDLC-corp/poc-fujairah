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
  /** The one still to be acknowledged — drives the alert. */
  announced: string | null
}

const initialState: IncidentsState = {
  raised: [],
  announced: null,
}

const incidentsSlice = createSlice({
  name: 'incidents',
  initialState,
  reducers: {
    /** Reports a geofence: it goes live on the map and raises the alert. */
    raiseGeofence(state, action: PayloadAction<string>) {
      if (state.raised.includes(action.payload)) return
      state.raised.push(action.payload)
      state.announced = action.payload
    },
    /** Operator has seen it. The fence stays on the map; the alert goes away. */
    acknowledgeIncident(state) {
      state.announced = null
    },
  },
})

export const { raiseGeofence, acknowledgeIncident } = incidentsSlice.actions
export default incidentsSlice.reducer
