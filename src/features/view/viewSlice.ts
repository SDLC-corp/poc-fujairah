import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { setVessels3d } from '../layers/layersSlice'
import { PITCHED_VIEW } from '../../map/basemaps'

export type FocusTarget = 'port' | 'anchorage' | 'vessel' | 'area' | 'geofence' | 'point'

interface ViewState {
  /** Camera tilt in degrees, 0 = straight down. */
  pitch: number
  /** Camera rotation in degrees, 0 = north up. */
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

const initialState: ViewState = { pitch: PITCHED_VIEW, bearing: 0, focusRequest: null }

const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    setPitch(state, action: PayloadAction<number>) {
      state.pitch = action.payload
    },
    setBearing(state, action: PayloadAction<number>) {
      state.bearing = action.payload
    },
    resetNorth(state) {
      state.bearing = 0
    },
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
  extraReducers: (builder) => {
    // Extrusions are invisible from straight above, so the 3D switch also
    // decides whether the camera is tilted.
    builder.addCase(setVessels3d, (state, action) => {
      state.pitch = action.payload ? PITCHED_VIEW : 0
    })
  },
})

export const {
  setPitch,
  setBearing,
  resetNorth,
  focusOn,
  focusVessel,
  focusFeature,
  focusPoint,
} = viewSlice.actions
export default viewSlice.reducer
