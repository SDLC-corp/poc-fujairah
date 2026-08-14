import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { loadPortData } from './features/portData/portDataSlice'
import { toggleNav } from './features/ui/uiSlice'
import { signOut } from './features/auth/authSlice'
import LoginScreen from './components/LoginScreen'
import DashboardKpis from './components/DashboardKpis'
import HeaderUtilisation from './components/HeaderUtilisation'
import MapView from './components/MapView'
import TabRail from './components/TabRail'
import { TABS } from './components/tabs'
import FeatureDetails from './components/FeatureDetails'
import IncidentAlert from './components/IncidentAlert'
import MapFocusControl from './components/MapFocusControl'
import MapLegend from './components/MapLegend'
import CompassRose from './components/CompassRose'
import DashboardScreen from './components/screens/DashboardScreen'
import TrackingScreen from './components/screens/TrackingScreen'
import PlaybackScreen from './components/screens/PlaybackScreen'
import OccupancyScreen from './components/screens/OccupancyScreen'
import AssignmentScreen from './components/screens/AssignmentScreen'
import VesselDetailsScreen from './components/screens/VesselDetailsScreen'
import ReportsScreen from './components/screens/ReportsScreen'
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
  reports: ReportsScreen,
  settings: SettingsScreen,
  help: HelpScreen,
}

export default function App() {
  const dispatch = useAppDispatch()
  const status = useAppSelector((s) => s.portData.status)
  const error = useAppSelector((s) => s.portData.error)
  const navOpen = useAppSelector((s) => s.ui.navOpen)
  const activeTab = useAppSelector((s) => s.ui.activeTab)
  const user = useAppSelector((s) => s.auth.user)

  useEffect(() => {
    // Port data is only fetched once past the gate, so a signed-out visitor
    // never pulls the dataset.
    if (user && status === 'idle') dispatch(loadPortData())
  }, [user, status, dispatch])

  if (!user) return <LoginScreen />

  const Screen = SCREENS[activeTab]
  const tab = TABS.find((t) => t.id === activeTab)
  // The map belongs to the screens that are about where vessels physically are:
  // the dashboard's live overview and the assignment workflow. The rest are
  // data-only.
  const showsMap = activeTab === 'assignment' || activeTab === 'dashboard'
  // Tracking carries its own map and lays out its two columns itself, so it
  // opts out of both the standard split and the scrolling card grid.
  const ownsLayout = activeTab === 'tracking' || activeTab === 'playback'

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
        <div className="app-title">
          <h1>Port of Fujairah — Proof of Concept</h1>
        </div>
        {/* <span className={`status status-${status}`}>
          {status === 'ready' ? 'Data loaded' : status === 'loading' ? 'Loading…' : status}
        </span> */}
        <HeaderUtilisation />
        <div className="app-user">
          <span className="app-user-name" title={user.email}>
            {user.name}
          </span>
          <button type="button" className="sign-out" onClick={() => dispatch(signOut())}>
            Sign out
          </button>
        </div>
      </header>

      {/* Mounted at the root so a reported incident follows the operator
          whichever screen they are on. */}
      <IncidentAlert />

      <div className="app-body">
        <TabRail />

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
              <div className="dash-body">
                <div className="dash-map">
                  <MapView />
                  <MapFocusControl />
                  <CompassRose />
                  <MapLegend />
                  <FeatureDetails />
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
              <div className="map-pane">
                <MapView />
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
