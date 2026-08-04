import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { SelectedFeature } from '../../types/gis'

interface SelectionState {
  selected: SelectedFeature | null
}

const initialState: SelectionState = { selected: null }

const selectionSlice = createSlice({
  name: 'selection',
  initialState,
  reducers: {
    selectFeature(state, action: PayloadAction<SelectedFeature>) {
      state.selected = action.payload
    },
    clearSelection(state) {
      state.selected = null
    },
  },
})

export const { selectFeature, clearSelection } = selectionSlice.actions
export default selectionSlice.reducer
