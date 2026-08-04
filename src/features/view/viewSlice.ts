import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { setVessels3d } from '../layers/layersSlice'
import { PITCHED_VIEW } from '../../map/basemaps'

export type FocusTarget = 'port' | 'anchorage'

interface ViewState {
  /** Camera tilt in degrees, 0 = straight down. */
  pitch: number
  /** Camera rotation in degrees, 0 = north up. */
  bearing: number
  /** Nonce-carrying fit request, so asking for the same extent twice re-fires. */
  focusRequest: { target: FocusTarget; n: number } | null
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
  },
  extraReducers: (builder) => {
    // Extrusions are invisible from straight above, so the 3D switch also
    // decides whether the camera is tilted.
    builder.addCase(setVessels3d, (state, action) => {
      state.pitch = action.payload ? PITCHED_VIEW : 0
    })
  },
})

export const { setPitch, setBearing, resetNorth, focusOn } = viewSlice.actions
export default viewSlice.reducer
