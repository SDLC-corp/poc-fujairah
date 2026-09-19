import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { loadPortData } from './features/portData/portDataSlice'
import { setTab, toggleNav } from './features/ui/uiSlice'
import { selectAllowedTabs, selectCurrentRole } from './features/roles/selectors'
import { selectCurrentUser } from './features/users/selectors'
import { signOut } from './features/auth/authSlice'
import LoginScreen from './components/LoginScreen'
import BrandLogo from './components/BrandLogo'
import BroadcastButton from './components/BroadcastButton'
import DashboardKpis from './components/DashboardKpis'
import DragAlert from './components/DragAlert'
import HeaderUtilisation from './components/HeaderUtilisation'
import MapView from './components/MapView'
import TabRail from './components/TabRail'
import ThemeSwitch from './components/ThemeSwitch'
import { TABS } from './components/tabs'
import FeatureDetails from './components/FeatureDetails'
import IncidentWatch from './components/IncidentWatch'
import MapFocusControl from './components/MapFocusControl'
import MapFullscreen from './components/MapFullscreen'
import DashPanelsToggle from './components/DashPanelsToggle'
import MapLegend from './components/MapLegend'
import CompassRose from './components/CompassRose'
import DashboardScreen from './components/screens/DashboardScreen'
import TrackingScreen from './components/screens/TrackingScreen'
import PlaybackScreen from './components/screens/PlaybackScreen'
import OccupancyScreen from './components/screens/OccupancyScreen'
import AssignmentScreen from './components/screens/AssignmentScreen'
import VesselDetailsScreen from './components/screens/VesselDetailsScreen'
import IncidentsScreen from './components/screens/IncidentsScreen'
import IncidentDetailScreen from './components/screens/IncidentDetailScreen'
import DrawIncidentScreen from './components/screens/DrawIncidentScreen'
import ReportsScreen from './components/screens/ReportsScreen'
import UsersScreen from './components/screens/UsersScreen'
import RolesScreen from './components/screens/RolesScreen'
import SettingsScreen from './components/screens/SettingsScreen'
import HelpScreen from './components/screens/HelpScreen'
import './App.css'

const SCREENS = {
  dashboard: DashboardScreen,
  tracking: TrackingScreen,
  playback: PlaybackScreen,
  occupancy: OccupancyScreen,
  assignment: AssignmentScreen,
  vessel: VesselDetailsScreen,
  incidents: IncidentsScreen,
  incident: IncidentDetailScreen,
  'incident-draw': DrawIncidentScreen,
  reports: ReportsScreen,
  users: UsersScreen,
  roles: RolesScreen,
  settings: SettingsScreen,
  help: HelpScreen,
}

export default function App() {
  const dispatch = useAppDispatch()
  const status = useAppSelector((s) => s.portData.status)
  const error = useAppSelector((s) => s.portData.error)
  const navOpen = useAppSelector((s) => s.ui.navOpen)
  const activeTab = useAppSelector((s) => s.ui.activeTab)
  const mapFullscreen = useAppSelector((s) => s.ui.mapFullscreen)
  const dashPanelsOpen = useAppSelector((s) => s.ui.dashPanelsOpen)
  const theme = useAppSelector((s) => s.ui.theme)
  const user = useAppSelector((s) => s.auth.user)
  const allowedTabs = useAppSelector(selectAllowedTabs)
  const currentRole = useAppSelector(selectCurrentRole)
  // The live account, so a rename on the Users screen shows here straight away
  // rather than waiting for the next sign-in.
  const account = useAppSelector(selectCurrentUser)

  useEffect(() => {
    // Port data is only fetched once past the gate, so a signed-out visitor
    // never pulls the dataset.
    if (user && status === 'idle') dispatch(loadPortData())
  }, [user, status, dispatch])

  /**
   * The theme tokens hang off the document root rather than the app shell, so
   * the login screen — which renders instead of the shell, not inside it — is
   * themed too, and so is the scrollbar and any form control the browser paints
   * from `color-scheme`.
   */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  /**
   * Land on something this role can actually open.
   *
   * Hiding the tab is not enough on its own: the store remembers the last
   * screen, so signing out of an admin account and into a tug operator would
   * otherwise leave Settings selected with its tab gone from the rail. Moving
   * the selection is the other half of the same rule.
   */
  useEffect(() => {
    if (!user || allowedTabs.has(activeTab)) return
    const first = TABS.find((t) => !t.offRail && allowedTabs.has(t.id))
    if (first) dispatch(setTab(first.id))
  }, [user, activeTab, allowedTabs, dispatch])

  if (!user) return <LoginScreen />
  // The redirect above lands next render; until then, draw nothing rather than
  // a screen this role is not entitled to.
  if (!allowedTabs.has(activeTab)) return null

  const Screen = SCREENS[activeTab]
  const tab = TABS.find((t) => t.id === activeTab)
  // The map belongs to the screens that are about where vessels physically are:
  // the dashboard's live overview and the assignment workflow. The rest are
  // data-only.
  const showsMap = activeTab === 'assignment' || activeTab === 'dashboard'
  // Tracking carries its own map and lays out its two columns itself, so it
  // opts out of both the standard split and the scrolling card grid.
  // Tracking and playback carry their own map and lay out their columns
  // themselves; the incident register does the same, because the map belongs
  // between its cards and its filters rather than beside the whole screen.
  /**
   * Screens where a full-screen chart means the whole screen.
   *
   * The register and the draw screen, because on both the map is the work
   * rather than an illustration beside it. Not the dashboard: its expanded map
   * is a wider column, not a takeover, and its rail should stay.
   */
  const railHidden =
    mapFullscreen && (activeTab === 'incidents' || activeTab === 'incident-draw')

  const ownsLayout =
    activeTab === 'tracking' ||
    activeTab === 'playback' ||
    activeTab === 'incidents' ||
    activeTab === 'incident-draw'

  return (
    <div className={`app${navOpen ? ' nav-open' : ''}`}>
      <header className="app-header">
        <button
          type="button"
          className="nav-toggle"
          aria-label={navOpen ? 'Hide navigation' : 'Show navigation'}
          aria-expanded={navOpen}
          onClick={() => dispatch(toggleNav())}
        >
          <span />
          <span />
          <span />
        </button>
        <BrandLogo />
        <div className="app-title">
          <h1>Port of Fujairah — Anchorage Management</h1>
        </div>
        {/* <span className={`status status-${status}`}>
          {status === 'ready' ? 'Data loaded' : status === 'loading' ? 'Loading…' : status}
        </span> */}
        <HeaderUtilisation />
        <BroadcastButton />
        <ThemeSwitch />
        <div className="app-user">
          <span className="app-user-name" title={account?.email ?? user.email}>
            {account?.name ?? user.name}
            {/* The role, not just the person: which screens are on the rail
                follows from it, so it has to be visible when they differ. */}
            <small>{currentRole?.name ?? 'No role'}</small>
          </span>
          <button type="button" className="sign-out" onClick={() => dispatch(signOut())}>
            Sign out
          </button>
        </div>
      </header>

      {/* Headless: puts declared zones on the chart on its own timer. */}
      <IncidentWatch />
      {/* The console's one notification, mounted at the root so it follows the
          operator whichever screen they are on. */}
      <DragAlert />

      {/* The rail stands down for a full-screen chart on the register.
          Full screen there means the map is the whole screen, and a navigation
          column beside it is the one thing still arguing otherwise. Scoped to
          this tab rather than to the flag: the dashboard's expanded map is a
          wider column, not a takeover, and its rail should stay. */}
      <div className={`app-body${railHidden ? ' rail-hidden' : ''}`}>
        {!railHidden && <TabRail />}

        <section className="screen">
          <div className="screen-head">
            <h2>{tab?.label}</h2>
            <span className="mock-tag">sample data</span>
          </div>

          {activeTab === 'dashboard' ? (
            /* KPI cards across the top, then map beside the statistics. The
               page scrolls as one rather than each pane scrolling itself. */
            <div className="screen-scroll">
              <DashboardKpis />
              {/* `panels-open` only means anything while the map is expanded —
                  at rest the statistics are a column of the page, not a thing
                  that opens. */}
              <div className={`dash-body${dashPanelsOpen ? ' panels-open' : ''}`}>
                <div className={`dash-map${mapFullscreen ? ' map-expanded' : ''}`}>
                  <MapView />
                  <MapFullscreen />
                  <MapFocusControl />
                  <CompassRose />
                  <MapLegend />
                  <FeatureDetails />
                  {mapFullscreen && <DashPanelsToggle />}
                  {status === 'failed' && (
                    <div className="map-error">Failed to load port data: {error}</div>
                  )}
                </div>
                <div className="dash-panels">
                  <Screen />
                </div>
              </div>
            </div>
          ) : showsMap ? (
            <div className="screen-split">
              <div className={`map-pane${mapFullscreen ? ' map-expanded' : ''}`}>
                <MapView />
                <MapFullscreen />
                <MapFocusControl />
                <CompassRose />
                <MapLegend />
                <FeatureDetails />
                {status === 'failed' && (
                  <div className="map-error">Failed to load port data: {error}</div>
                )}
              </div>
              <aside className="split-panel">
                <Screen />
              </aside>
            </div>
          ) : ownsLayout ? (
            <Screen />
          ) : (
            <div className="screen-scroll">
              <div className="screen-grid">
                <Screen />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
