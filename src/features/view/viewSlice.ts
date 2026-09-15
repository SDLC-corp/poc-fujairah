import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { FIXED_BEARING } from '../../map/basemaps'

export type FocusTarget = 'port' | 'anchorage' | 'vessel' | 'area' | 'geofence' | 'point'

interface ViewState {
  /**
   * Camera rotation in degrees. Always 0 — the chart is locked north-up at the
   * map itself, and nothing here can change it. Kept because the compass rose
   * turns with the chart, and a rose that reads its bearing from the view is
   * the honest way to say the chart is not turning.
   */
  bearing: number
  /** Nonce-carrying fit request, so asking for the same extent twice re-fires. */
  focusRequest: {
    target: FocusTarget
    id?: string
    /** Only for `point` — an arbitrary place with no feature behind it. */
    coordinates?: [number, number]
    n: number
  } | null
}

const initialState: ViewState = { bearing: FIXED_BEARING, focusRequest: null }

const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    focusOn(state, action: PayloadAction<FocusTarget>) {
      state.focusRequest = { target: action.payload, n: (state.focusRequest?.n ?? 0) + 1 }
    },
    /** Centre the camera on one vessel — used by the tracking list. */
    focusVessel(state, action: PayloadAction<string>) {
      state.focusRequest = {
        target: 'vessel',
        id: action.payload,
        n: (state.focusRequest?.n ?? 0) + 1,
      }
    },
    /** Fly to a bare coordinate — used to locate a proposed spot. */
    focusPoint(state, action: PayloadAction<[number, number]>) {
      state.focusRequest = {
        target: 'point',
        coordinates: action.payload,
        n: (state.focusRequest?.n ?? 0) + 1,
      }
    },
    /**
     * Frame one named feature and open a popup on it — how the dashboard's
     * alert feed jumps the operator to whatever it is reporting.
     */
    focusFeature(state, action: PayloadAction<{ target: FocusTarget; id: string }>) {
      state.focusRequest = {
        target: action.payload.target,
        id: action.payload.id,
        n: (state.focusRequest?.n ?? 0) + 1,
      }
    },
  },
})

export const {
  focusOn,
  focusVessel,
  focusFeature,
  focusPoint,
} = viewSlice.actions
export default viewSlice.reducer
