import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

/**
 * The clearance the port states between anchored vessels, quoted on the vessel
 * details as operators expect to read it — in miles.
 *
 * It is a stated figure, deliberately not `safetyMarginM`. That one is the
 * slack the swing radius carries in its own arithmetic (LOA x factor + margin)
 * and stays in metres because the geometry does. Making the radius use 0.3 NM
 * instead adds 556 m to every circle and empties the anchorage — the sample
 * fleet drops from 155 vessels to 27, and packing BN places none at all.
 */
export const SAFETY_MARGIN_NM = 0.3

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
