import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

interface AnalysisState {
  /** Proximity search radius around the selected vessel, in kilometres. */
  bufferRadiusKm: number
  showBuffer: boolean
  showNearestBerthLine: boolean
  /**
   * Swing-circle configuration: a vessel at anchor sweeps a circle of roughly
   * LOA x factor, plus a margin so two safe areas never touch.
   */
  swingFactor: number
  safetyMarginM: number
}

const initialState: AnalysisState = {
  bufferRadiusKm: 0.6,
  /**
   * Off by default. The buffer is a search radius for the proximity panel, not
   * a property of the vessel — but on by default it drew a second dashed circle
   * around every selection, sitting concentric with the swing circle and
   * reading as if the ship had two safe areas. The swing circle is the water
   * the vessel actually occupies and is the one that belongs on a click; the
   * buffer is switched on from Proximity analysis when it is being used.
   */
  showBuffer: false,
  showNearestBerthLine: true,
  swingFactor: 2,
  safetyMarginM: 10,
}

const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    setBufferRadiusKm(state, action: PayloadAction<number>) {
      state.bufferRadiusKm = action.payload
    },
    setShowBuffer(state, action: PayloadAction<boolean>) {
      state.showBuffer = action.payload
    },
    setShowNearestBerthLine(state, action: PayloadAction<boolean>) {
      state.showNearestBerthLine = action.payload
    },
    setSwingFactor(state, action: PayloadAction<number>) {
      state.swingFactor = action.payload
    },
    setSafetyMarginM(state, action: PayloadAction<number>) {
      state.safetyMarginM = action.payload
    },
  },
})

export const {
  setBufferRadiusKm,
  setShowBuffer,
  setShowNearestBerthLine,
  setSwingFactor,
  setSafetyMarginM,
} = analysisSlice.actions
export default analysisSlice.reducer
