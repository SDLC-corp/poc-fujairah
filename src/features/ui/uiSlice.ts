import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export type TabId =
  | 'dashboard'
  | 'tracking'
  | 'playback'
  | 'occupancy'
  | 'assignment'
  | 'vessel'
  | 'reports'
  | 'settings'
  | 'help'

interface UiState {
  /** Whether the icon nav rail is shown. */
  navOpen: boolean
  activeTab: TabId
}

const initialState: UiState = { navOpen: true, activeTab: 'dashboard' }

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleNav(state) {
      state.navOpen = !state.navOpen
    },
    setNavOpen(state, action: PayloadAction<boolean>) {
      state.navOpen = action.payload
    },
    setTab(state, action: PayloadAction<TabId>) {
      state.activeTab = action.payload
    },
  },
})

export const { toggleNav, setNavOpen, setTab } = uiSlice.actions
export default uiSlice.reducer
