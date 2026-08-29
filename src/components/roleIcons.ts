import type { IconType } from 'react-icons'
import {
  FiAnchor,
  FiBarChart2,
  FiBell,
  FiClipboard,
  FiEdit2,
  FiEye,
  FiFileText,
  FiGrid,
  FiList,
  FiLock,
  FiNavigation,
  FiPlayCircle,
  FiSettings,
  FiShield,
  FiUsers,
} from 'react-icons/fi'
import type { AccessLevel, ModuleId } from '../features/roles/rolesSlice'

/**
 * Icons for the access-control screens.
 *
 * They live here rather than on the module definitions so the slice stays free
 * of presentation, and they come from react-icons rather than the app's inline
 * `Icon` set because that set was drawn for the map — it has an anchor and a
 * vessel, not a shield or a bell.
 */
export const MODULE_ICONS: Record<ModuleId, IconType> = {
  dashboard: FiGrid,
  liveAnchorage: FiAnchor,
  vesselRequests: FiFileText,
  assignment: FiClipboard,
  vesselTracking: FiNavigation,
  playback: FiPlayCircle,
  alerts: FiBell,
  reports: FiBarChart2,
  users: FiUsers,
  roles: FiShield,
  audit: FiList,
  settings: FiSettings,
}

/** See it, change it, or be shut out of it. */
export const LEVEL_ICONS: Record<AccessLevel, IconType> = {
  none: FiLock,
  view: FiEye,
  readwrite: FiEdit2,
}
