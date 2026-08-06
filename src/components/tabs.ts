import type { TabId } from '../features/ui/uiSlice'

/** Screens in the side drawer, in rail order. */
export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'tracking', label: 'Vessel tracking', icon: 'tracking' },
  { id: 'playback', label: 'Vessel playback', icon: 'playback' },
  { id: 'occupancy', label: 'Occupancy', icon: 'occupancy' },
  { id: 'assignment', label: 'Assignment', icon: 'assignment' },
  { id: 'vessel', label: 'Vessel details', icon: 'vessel' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'help', label: 'Help & support', icon: 'help' },
]
