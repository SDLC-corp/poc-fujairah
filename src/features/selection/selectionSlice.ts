import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { setTab } from '../ui/uiSlice'
import type { SelectedFeature } from '../../types/gis'

interface SelectionState {
  selected: SelectedFeature | null
  /**
   * Whether the floating details card is showing for that selection.
   *
   * Kept apart from the selection itself because the two answer different
   * questions. The selection is "which feature is the console working on" — the
   * vessel screen reads it to know whose details to draw, the assignment screen
   * to know whose spot is being released, the map to know what to highlight.
   * This flag is only "is the card over the chart open", and a card is a thing
   * the operator opened by clicking, on one screen, for one look.
   *
   * Changing tab closes it. Carrying it across would drop a card over a chart
   * nobody opened one on, describing a click made on a different screen — while
   * clearing the selection instead would break the button on that very card
   * that sends the operator to the vessel's own screen.
   */
  cardOpen: boolean
}

const initialState: SelectionState = { selected: null, cardOpen: false }

const selectionSlice = createSlice({
  name: 'selection',
  initialState,
  reducers: {
    selectFeature(state, action: PayloadAction<SelectedFeature>) {
      state.selected = action.payload
      // Every selection is a click on something, so every selection opens it.
      state.cardOpen = true
    },
    /**
     * Selects a feature without opening the card.
     *
     * For selections the console makes on the operator's behalf rather than
     * ones they asked for — the replay lighting up whichever ship it is
     * following, say. The halo and the highlight are wanted; a card nobody
     * opened, sitting over the chart from the moment the screen loads, is not.
     */
    highlightFeature(state, action: PayloadAction<SelectedFeature>) {
      state.selected = action.payload
      state.cardOpen = false
    },
    clearSelection(state) {
      state.selected = null
      state.cardOpen = false
    },
    /** Puts the card away without forgetting what is selected. */
    closeCard(state) {
      state.cardOpen = false
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setTab, (state) => {
      state.cardOpen = false
    })
  },
})

export const { selectFeature, highlightFeature, clearSelection, closeCard } =
  selectionSlice.actions
export default selectionSlice.reducer
