import type { TabId } from '../features/ui/uiSlice'

/**
 * Every screen, in rail order. `offRail` ones are reachable only from a link on
 * another screen — they still need an entry here so the header can title them.
 */
export const TABS: { id: TabId; label: string; icon: string; offRail?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'tracking', label: 'Vessel tracking', icon: 'tracking' },
  { id: 'playback', label: 'Vessel playback', icon: 'playback' },
  { id: 'occupancy', label: 'Occupancy', icon: 'occupancy' },
  { id: 'assignment', label: 'Assignment', icon: 'assignment' },
  { id: 'vessel', label: 'Vessel details', icon: 'vessel', offRail: true },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'help', label: 'Help & support', icon: 'help' },
]
