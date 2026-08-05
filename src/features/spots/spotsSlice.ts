import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export type LngLat = [number, number]

interface SpotsState {
  /** Free spot clicked on the map — its details popup is open. */
  selectedId: string | null
  /** True once the operator has chosen to relocate it, making it draggable. */
  relocating: boolean
  /** Operator-moved spot centres, keyed by spot id. */
  moved: Record<string, LngLat>
  /** Vessel currently waiting for the operator to click a spot on the map. */
  pickingFor: string | null
  /** Spot chosen from the map per vessel, keyed by vessel id. */
  picked: Record<string, string>
}

const initialState: SpotsState = {
  selectedId: null,
  relocating: false,
  moved: {},
  pickingFor: null,
  picked: {},
}

/**
 * The allocator lays free spots on a fixed grid. This lets an operator pick one
 * up and put it exactly where they want it — the grid is a proposal, the
 * harbour master decides.
 */
const spotsSlice = createSlice({
  name: 'spots',
  initialState,
  reducers: {
    /** Clicking a green circle opens its details; it is not movable yet. */
    selectSpot(state, action: PayloadAction<string>) {
      state.selectedId = action.payload
      state.relocating = false
    },
    clearSpot(state) {
      state.selectedId = null
      state.relocating = false
    },
    /** Operator asked to relocate — hand over the drag handle. */
    startRelocate(state) {
      if (state.selectedId) state.relocating = true
    },
    cancelRelocate(state) {
      state.relocating = false
    },
    moveSpot(state, action: PayloadAction<{ id: string; coordinates: LngLat }>) {
      state.moved[action.payload.id] = action.payload.coordinates
    },
    /** Arm the map: the next free spot clicked is assigned to this vessel. */
    startPicking(state, action: PayloadAction<string>) {
      state.pickingFor = action.payload
      state.selectedId = null
      state.relocating = false
    },
    cancelPicking(state) {
      state.pickingFor = null
    },
    pickSpot(state, action: PayloadAction<{ vesselId: string; spotId: string }>) {
      state.picked[action.payload.vesselId] = action.payload.spotId
      state.pickingFor = null
    },
    clearPick(state, action: PayloadAction<string>) {
      delete state.picked[action.payload]
    },

    /** Put a moved spot back on its grid position. */
    resetSpot(state, action: PayloadAction<string>) {
      delete state.moved[action.payload]
    },
  },
})

export const {
  selectSpot,
  clearSpot,
  startRelocate,
  cancelRelocate,
  moveSpot,
  resetSpot,
  startPicking,
  cancelPicking,
  pickSpot,
  clearPick,
} = spotsSlice.actions
export default spotsSlice.reducer
