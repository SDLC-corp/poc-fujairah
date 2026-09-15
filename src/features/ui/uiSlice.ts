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
  | 'users'
  | 'roles'
  | 'settings'
  | 'help'

/**
 * Console themes, named for the light an operator is working in rather than for
 * the colours: a watch keeper asks for the night chart, not for "dark mode".
 * Day is the default. Each carries its own basemap and sea — see
 * BASEMAP_STYLES and SEA_INK in src/map/basemaps.ts, and the token blocks in
 * src/index.css.
 */
export type ThemeId = 'day' | 'dusk' | 'night'

export const THEMES: { id: ThemeId; label: string; hint: string }[] = [
  { id: 'day', label: 'Day', hint: 'Light console, daylight chart' },
  { id: 'dusk', label: 'Dusk', hint: 'Dark console, dusk chart' },
  { id: 'night', label: 'Night', hint: 'Dark console, night chart' },
]

const THEME_KEY = 'fujairah.poc.theme'

/** What the themes used to be called, so a stored preference still resolves. */
const RENAMED: Record<string, ThemeId> = {
  light: 'day',
  dark: 'dusk',
  satellite: 'night',
}

/**
 * localStorage rather than sessionStorage, unlike the demo session: a display
 * preference should outlive the tab it was set in.
 */
function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_KEY) ?? ''
    if (raw === 'day' || raw === 'dusk' || raw === 'night') return raw
    return RENAMED[raw] ?? 'day'
  } catch {
    return 'day'
  }
}

interface UiState {
  /** Whether the icon nav rail is shown. */
  navOpen: boolean
  activeTab: TabId
  theme: ThemeId
  /**
   * Whether the map pane is expanded over the rest of the screen.
   *
   * One flag for the whole app rather than one per screen, because only one map
   * is ever mounted at a time — each screen that has one has exactly one, and
   * the pane that reads this is the pane that owns the toggle.
   */
  mapFullscreen: boolean
  /**
   * Panels the operator has folded away, by id.
   *
   * Held here rather than in each panel so "collapse all" is one action, and so
   * the state survives the panel unmounting — a panel that forgets it was shut
   * every time the map is expanded and collapsed is not a preference, it is a
   * flicker. Collapsed is the exception, so the list holds the shut ones and an
   * unknown panel is open.
   */
  collapsedPanels: string[]
}

const initialState: UiState = {
  navOpen: true,
  activeTab: 'dashboard',
  theme: readStoredTheme(),
  mapFullscreen: false,
  collapsedPanels: [],
}

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
    setTheme(state, action: PayloadAction<ThemeId>) {
      state.theme = action.payload
      try {
        localStorage.setItem(THEME_KEY, action.payload)
      } catch {
        // Private browsing can refuse the write; the theme still applies for
        // this session, it just will not be remembered.
      }
    },
    toggleMapFullscreen(state) {
      state.mapFullscreen = !state.mapFullscreen
    },
    setMapFullscreen(state, action: PayloadAction<boolean>) {
      state.mapFullscreen = action.payload
    },
    togglePanel(state, action: PayloadAction<string>) {
      const id = action.payload
      state.collapsedPanels = state.collapsedPanels.includes(id)
        ? state.collapsedPanels.filter((p) => p !== id)
        : [...state.collapsedPanels, id]
    },
    /** Folds a known set away, or opens everything when given nothing. */
    setCollapsedPanels(state, action: PayloadAction<string[]>) {
      state.collapsedPanels = action.payload
    },
  },
})

export const {
  toggleNav,
  setNavOpen,
  setTab,
  setTheme,
  toggleMapFullscreen,
  setMapFullscreen,
  togglePanel,
  setCollapsedPanels,
} = uiSlice.actions
export default uiSlice.reducer
