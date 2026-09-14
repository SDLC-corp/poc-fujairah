import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { TabId } from '../ui/uiSlice'

/**
 * Role-based access control for the console.
 *
 * A module grants access in three layers rather than as a row of identical
 * checkboxes:
 *
 *   - **Access level** — the default scope for the module as a whole. Not every
 *     module offers every level: Dashboard and Audit Log are read-only by
 *     nature, so offering "Read & Write" on them would be a promise the system
 *     cannot keep.
 *   - **Capabilities** — the specific things this module can do. They are not
 *     uniform: "Reassign Vessel" means something on Assignment and nothing on
 *     Reports, which is why a shared Add/Edit/Delete grid flattens the real
 *     permissions into columns that do not apply.
 *   - **Scope** — where a module acts on a set of things, how wide that set is.
 */

export type AccessLevel = 'none' | 'view' | 'readwrite'

export const ACCESS_LEVELS: { id: AccessLevel; label: string }[] = [
  { id: 'none', label: 'No Access' },
  { id: 'view', label: 'View Only' },
  { id: 'readwrite', label: 'Read & Write' },
]

/** What a module offers when it does not narrow the list itself. */
const READ_WRITE: AccessLevel[] = ['none', 'view', 'readwrite']
/** Modules that can only ever be looked at. */
const READ_ONLY: AccessLevel[] = ['none', 'view']

export type ModuleId =
  | 'dashboard'
  | 'occupancy'
  | 'liveAnchorage'
  | 'vesselRequests'
  | 'assignment'
  | 'vesselTracking'
  | 'playback'
  | 'alerts'
  | 'reports'
  | 'users'
  | 'roles'
  | 'audit'
  | 'settings'

export interface Capability {
  id: string
  label: string
  /** Shown behind an info marker where the label alone is ambiguous. */
  hint?: string
}

export interface ModuleDef {
  id: ModuleId
  label: string
  blurb: string
  /** The access levels this module offers. */
  levels: AccessLevel[]
  capabilities: Capability[]
  /** Modules that act on a set of things declare how wide that set is. */
  scope?: { label: string; options: string[] }
  /**
   * The screen in the nav rail this module gates. A role with No Access here
   * does not see that tab at all.
   *
   * Not every module has one: Vessel Requests, Alerts and the Audit Log are
   * permissions the port asked for that have no screen yet. They are left
   * unlinked rather than pointed at an approximate tab, so the day a screen is
   * built the permission is already there and already assigned.
   */
  tab?: TabId
}

export const MODULES: ModuleDef[] = [
  {
    id: 'dashboard',
    tab: 'dashboard',
    label: 'Dashboard',
    blurb: 'Access to overview dashboards and key analytics.',
    levels: READ_ONLY,
    capabilities: [{ id: 'viewDashboard', label: 'View Dashboard' }],
  },
  {
    id: 'occupancy',
    tab: 'occupancy',
    label: 'Occupancy',
    blurb: 'Utilisation per area, and how it trends through the day.',
    levels: READ_ONLY,
    capabilities: [
      { id: 'viewOccupancy', label: 'View Occupancy' },
      { id: 'exportOccupancy', label: 'Export Occupancy' },
    ],
  },
  {
    id: 'liveAnchorage',
    tab: 'vessel',
    label: 'Live Anchorage',
    blurb: 'View live vessel positions and anchorage status.',
    levels: READ_WRITE,
    capabilities: [
      { id: 'viewVesselDetails', label: 'View Vessel Details' },
      { id: 'trackVessel', label: 'Track Vessel' },
      { id: 'viewAnchorageStatus', label: 'View Anchorage Status' },
      { id: 'viewVesselMovement', label: 'View Vessel Movement' },
    ],
  },
  {
    id: 'vesselRequests',
    label: 'Vessel Requests',
    blurb: 'Manage anchoring requests and related workflow.',
    levels: READ_WRITE,
    capabilities: [
      { id: 'createRequest', label: 'Create Request' },
      { id: 'editRequest', label: 'Edit Request' },
      { id: 'approveRequest', label: 'Approve Request' },
      { id: 'rejectRequest', label: 'Reject Request' },
      { id: 'exportRequests', label: 'Export Requests' },
    ],
  },
  {
    id: 'assignment',
    tab: 'assignment',
    label: 'Assignment',
    blurb: 'Assign and manage vessel spots and schedules.',
    levels: READ_WRITE,
    capabilities: [
      { id: 'assignSpot', label: 'Assign Anchorage Spot' },
      {
        id: 'changeSpot',
        label: 'Change Anchorage Spot',
        hint: 'Move a spot to different coordinates after it has been generated.',
      },
      {
        id: 'reassignVessel',
        label: 'Reassign Vessel',
        hint: 'Move an already-anchored vessel to a different spot.',
      },
      {
        id: 'manageSpotStatus',
        label: 'Manage Spot Status',
        hint: 'Reserve, release or block a spot without a vessel movement.',
      },
      { id: 'viewAssignmentHistory', label: 'View Assignment History' },
      { id: 'shareAssignment', label: 'Share Assignment' },
    ],
    scope: {
      label: 'Default Assignment Access',
      options: ['Assigned Only', 'Assigned & Shared', 'All Assignments'],
    },
  },
  {
    id: 'vesselTracking',
    tab: 'tracking',
    label: 'Vessel Tracking',
    blurb: 'Real-time vessel tracking and movement history.',
    levels: READ_WRITE,
    capabilities: [
      { id: 'viewLiveLocation', label: 'View Live Location' },
      { id: 'viewTrackHistory', label: 'View Track History' },
      { id: 'viewVesselMovement', label: 'View Vessel Movement' },
      { id: 'downloadTrack', label: 'Download Track' },
    ],
  },
  {
    id: 'playback',
    tab: 'playback',
    label: 'Playback',
    blurb: 'Historical data playback of vessel movements and events.',
    levels: READ_WRITE,
    capabilities: [
      { id: 'viewPlayback', label: 'View Playback' },
      { id: 'viewHistoricalEvents', label: 'View Historical Events' },
      { id: 'downloadPlayback', label: 'Download Playback' },
    ],
  },
  {
    id: 'alerts',
    label: 'Alerts',
    blurb: 'View and manage system alerts and notifications.',
    levels: READ_WRITE,
    capabilities: [
      { id: 'viewAlerts', label: 'View Alerts' },
      { id: 'acknowledgeAlert', label: 'Acknowledge Alert' },
      { id: 'assignAlert', label: 'Assign Alert' },
      { id: 'commentAlert', label: 'Comment on Alert' },
      { id: 'resolveAlert', label: 'Resolve Alert' },
      { id: 'notifyStakeholders', label: 'Notify Stakeholders' },
    ],
    scope: {
      label: 'Default Alert Access',
      options: ['My Alerts', 'Area Alerts', 'All Alerts'],
    },
  },
  {
    id: 'reports',
    tab: 'reports',
    label: 'Reports',
    blurb: 'View, generate and export system and operational reports.',
    levels: READ_WRITE,
    capabilities: [
      { id: 'viewReports', label: 'View Reports' },
      { id: 'generateReports', label: 'Generate Reports' },
      { id: 'scheduleReports', label: 'Schedule Reports' },
      { id: 'exportReports', label: 'Export Reports' },
      { id: 'shareReports', label: 'Share Reports' },
    ],
  },
  {
    id: 'users',
    tab: 'users',
    label: 'Users',
    blurb: 'Manage users and their roles within the system.',
    levels: READ_WRITE,
    capabilities: [
      { id: 'viewUsers', label: 'View Users' },
      { id: 'addUser', label: 'Add User' },
      { id: 'editUser', label: 'Edit User' },
      { id: 'deactivateUser', label: 'Deactivate User' },
      { id: 'assignRole', label: 'Assign Role' },
      {
        id: 'resetAccess',
        label: 'Reset Access',
        hint: 'Force a password reset and revoke the user’s active sessions.',
      },
    ],
  },
  {
    id: 'roles',
    tab: 'roles',
    label: 'Roles & Permissions',
    blurb: 'Create roles and define what each one can reach.',
    levels: READ_WRITE,
    capabilities: [
      { id: 'viewRoles', label: 'View Roles' },
      { id: 'createRole', label: 'Create Role' },
      { id: 'editRole', label: 'Edit Role' },
      { id: 'assignPermissions', label: 'Assign Permissions' },
      { id: 'duplicateRole', label: 'Duplicate Role' },
      {
        id: 'deactivateRole',
        label: 'Deactivate Role',
        hint: 'Users keep the role but it grants nothing until it is reactivated.',
      },
    ],
  },
  {
    id: 'audit',
    label: 'Audit Log',
    blurb: 'Who changed what, and when. Read-only by design.',
    // An audit trail you can write to is not an audit trail.
    levels: READ_ONLY,
    capabilities: [
      { id: 'viewActivity', label: 'View Activity' },
      { id: 'filterActivity', label: 'Filter Activity' },
      { id: 'viewDetails', label: 'View Details' },
      { id: 'exportAuditLog', label: 'Export Audit Log' },
    ],
  },
  {
    id: 'settings',
    tab: 'settings',
    label: 'Settings / Configuration',
    blurb: 'System configuration, parameters and reference data.',
    levels: READ_WRITE,
    capabilities: [
      { id: 'viewSettings', label: 'View Settings' },
      { id: 'updateConfiguration', label: 'Update Configuration' },
      {
        id: 'manageReferenceData',
        label: 'Manage Reference Data',
        hint: 'Anchorage areas, vessel types, depth data and the swing parameters.',
      },
    ],
  },
]

export interface ModulePermission {
  level: AccessLevel
  capabilities: Record<string, boolean>
  scope?: string
}

export type PermissionMatrix = Record<ModuleId, ModulePermission>

export interface Role {
  id: string
  name: string
  description: string
  /** Null for a root role. */
  parentId: string | null
  /**
   * How many accounts hold the role is not stored here — it is counted off the
   * users slice, so adding or reassigning a user moves the figure by itself
   * rather than leaving a headcount that has to be remembered separately.
   */
  active: boolean
  createdAt: string
  updatedAt: string
  /** Port-wide, or restricted to named anchorage areas. */
  scope: 'port' | 'areas'
  areas: string[]
  permissions: PermissionMatrix
}

type ModuleSpec = { level: AccessLevel; on?: string[] | 'all'; scope?: string }

/**
 * Builds a full matrix from a sparse description, defaulting the rest to no
 * access. A level a module does not offer is clamped to the closest it does,
 * so a spec can never produce a permission the module cannot honour.
 */
export function buildPermissions(
  spec: Partial<Record<ModuleId, ModuleSpec>> = {},
): PermissionMatrix {
  const out = {} as PermissionMatrix
  for (const m of MODULES) {
    const s = spec[m.id]
    const wanted = s?.level ?? 'none'
    const level = m.levels.includes(wanted) ? wanted : m.levels[m.levels.length - 1]
    const on = s?.on === 'all' ? m.capabilities.map((c) => c.id) : (s?.on ?? [])
    out[m.id] = {
      level,
      capabilities: Object.fromEntries(m.capabilities.map((c) => [c.id, on.includes(c.id)])),
      ...(m.scope ? { scope: s?.scope ?? m.scope.options[0] } : {}),
    }
  }
  return out
}

/** Everything a module offers — the shape a root administrator has. */
function allAccess(): PermissionMatrix {
  return buildPermissions(
    Object.fromEntries(
      MODULES.map((m) => [
        m.id,
        {
          level: m.levels[m.levels.length - 1],
          on: 'all' as const,
          ...(m.scope ? { scope: m.scope.options[m.scope.options.length - 1] } : {}),
        },
      ]),
    ),
  )
}

const initialRoles: Role[] = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    description: 'Unrestricted access, including roles and system configuration',
    parentId: null,
    active: true,
    createdAt: '2024-05-10T09:30:00Z',
    updatedAt: '2024-05-15T14:20:00Z',
    scope: 'port',
    areas: [],
    permissions: allAccess(),
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Full operational access; cannot change roles or configuration',
    parentId: 'super-admin',
    active: true,
    createdAt: '2024-05-10T09:31:00Z',
    updatedAt: '2024-05-15T14:20:00Z',
    scope: 'port',
    areas: [],
    permissions: buildPermissions({
      dashboard: { level: 'view', on: 'all' },
      occupancy: { level: 'view', on: 'all' },
      liveAnchorage: { level: 'readwrite', on: 'all' },
      vesselRequests: { level: 'readwrite', on: 'all' },
      assignment: { level: 'readwrite', on: 'all', scope: 'All Assignments' },
      vesselTracking: { level: 'readwrite', on: 'all' },
      playback: { level: 'readwrite', on: 'all' },
      alerts: { level: 'readwrite', on: 'all', scope: 'All Alerts' },
      reports: { level: 'readwrite', on: 'all' },
      users: { level: 'readwrite', on: 'all' },
      roles: { level: 'view', on: ['viewRoles'] },
      audit: { level: 'view', on: ['viewActivity', 'filterActivity', 'viewDetails'] },
      settings: { level: 'view', on: ['viewSettings'] },
    }),
  },
  {
    id: 'harbour-master',
    name: 'Harbour Master',
    description: 'Full access to all modules and settings',
    parentId: 'admin',
    active: true,
    createdAt: '2024-05-10T09:32:00Z',
    updatedAt: '2024-05-15T14:20:00Z',
    scope: 'port',
    areas: [],
    permissions: allAccess(),
  },
  {
    id: 'deputy-harbour-master',
    name: 'Deputy Harbour Master',
    description: 'Access to operations and approvals',
    parentId: 'harbour-master',
    active: true,
    createdAt: '2024-05-10T09:34:00Z',
    updatedAt: '2024-05-14T11:05:00Z',
    scope: 'port',
    areas: [],
    permissions: buildPermissions({
      dashboard: { level: 'view', on: 'all' },
      occupancy: { level: 'view', on: 'all' },
      liveAnchorage: { level: 'readwrite', on: 'all' },
      vesselRequests: { level: 'readwrite', on: 'all' },
      assignment: { level: 'readwrite', on: 'all', scope: 'All Assignments' },
      vesselTracking: { level: 'view', on: ['viewLiveLocation', 'viewTrackHistory'] },
      playback: { level: 'view', on: ['viewPlayback', 'viewHistoricalEvents'] },
      alerts: {
        level: 'readwrite',
        on: [
          'viewAlerts',
          'acknowledgeAlert',
          'commentAlert',
          'resolveAlert',
          'notifyStakeholders',
        ],
        scope: 'All Alerts',
      },
      reports: { level: 'readwrite', on: ['viewReports', 'generateReports', 'exportReports'] },
      users: { level: 'view', on: ['viewUsers'] },
      audit: { level: 'view', on: ['viewActivity', 'filterActivity', 'viewDetails'] },
    }),
  },
  {
    id: 'port-control-operator',
    name: 'Port Control Operator',
    description: 'Monitor and manage vessel operations',
    parentId: 'deputy-harbour-master',
    active: true,
    createdAt: '2024-05-10T09:40:00Z',
    updatedAt: '2024-05-13T08:15:00Z',
    scope: 'port',
    areas: [],
    permissions: buildPermissions({
      dashboard: { level: 'view', on: 'all' },
      occupancy: { level: 'view', on: 'all' },
      liveAnchorage: { level: 'readwrite', on: 'all' },
      vesselRequests: {
        level: 'readwrite',
        on: ['createRequest', 'editRequest', 'exportRequests'],
      },
      assignment: { level: 'view', on: ['viewAssignmentHistory'], scope: 'Assigned & Shared' },
      vesselTracking: { level: 'view', on: 'all' },
      playback: { level: 'view', on: ['viewPlayback', 'viewHistoricalEvents'] },
      alerts: {
        level: 'readwrite',
        on: ['viewAlerts', 'acknowledgeAlert', 'commentAlert'],
        scope: 'Area Alerts',
      },
      reports: { level: 'view', on: ['viewReports', 'exportReports'] },
    }),
  },
  {
    id: 'anchorage-officer',
    name: 'Anchorage Officer',
    description: 'Manage anchorage assignments',
    parentId: 'deputy-harbour-master',
    active: true,
    createdAt: '2024-05-10T09:30:00Z',
    updatedAt: '2024-05-15T14:20:00Z',
    scope: 'port',
    areas: [],
    permissions: buildPermissions({
      dashboard: { level: 'view', on: 'all' },
      occupancy: { level: 'view', on: 'all' },
      liveAnchorage: { level: 'readwrite', on: 'all' },
      vesselRequests: { level: 'readwrite', on: 'all' },
      assignment: { level: 'readwrite', on: 'all', scope: 'Assigned & Shared' },
      vesselTracking: { level: 'view', on: ['viewLiveLocation', 'viewTrackHistory'] },
      playback: { level: 'view', on: ['viewPlayback'] },
      alerts: {
        level: 'readwrite',
        on: ['viewAlerts', 'acknowledgeAlert', 'commentAlert', 'notifyStakeholders'],
        scope: 'All Alerts',
      },
      reports: { level: 'view', on: ['viewReports', 'exportReports'] },
      audit: { level: 'view', on: ['viewActivity', 'filterActivity'] },
    }),
  },
  {
    id: 'tug-operator',
    name: 'Tug Operator',
    description: 'View relevant operations and vessels',
    parentId: 'anchorage-officer',
    active: true,
    createdAt: '2024-05-11T07:12:00Z',
    updatedAt: '2024-05-12T16:40:00Z',
    scope: 'areas',
    areas: ['T', 'BN'],
    permissions: buildPermissions({
      dashboard: { level: 'view', on: 'all' },
      liveAnchorage: { level: 'view', on: ['viewVesselDetails', 'viewAnchorageStatus'] },
      assignment: { level: 'view', on: ['viewAssignmentHistory'], scope: 'Assigned Only' },
      vesselTracking: { level: 'view', on: ['viewLiveLocation'] },
      alerts: { level: 'view', on: ['viewAlerts', 'acknowledgeAlert'], scope: 'Area Alerts' },
    }),
  },
  {
    id: 'vts-operator',
    name: 'VTS Operator',
    description: 'Vessel tracking and traffic monitoring',
    parentId: 'harbour-master',
    active: true,
    createdAt: '2024-05-10T10:02:00Z',
    updatedAt: '2024-05-15T09:55:00Z',
    scope: 'port',
    areas: [],
    permissions: buildPermissions({
      dashboard: { level: 'view', on: 'all' },
      occupancy: { level: 'view', on: 'all' },
      liveAnchorage: { level: 'readwrite', on: 'all' },
      vesselTracking: { level: 'readwrite', on: 'all' },
      playback: { level: 'readwrite', on: 'all' },
      alerts: {
        level: 'readwrite',
        on: ['viewAlerts', 'acknowledgeAlert', 'assignAlert', 'notifyStakeholders'],
        scope: 'All Alerts',
      },
      reports: { level: 'view', on: ['viewReports', 'exportReports'] },
    }),
  },

  {
    id: 'external-stakeholder',
    name: 'External Stakeholder',
    description: 'Limited access to shared information',
    parentId: null,
    // Active, so the matching sign-in has something to show. Deactivating it
    // from the Roles screen strips its users' rail back to Help on the spot —
    // which is the point of the switch, and worth demonstrating live.
    active: true,
    createdAt: '2024-05-11T13:45:00Z',
    updatedAt: '2024-05-11T13:45:00Z',
    scope: 'areas',
    areas: ['A'],
    permissions: buildPermissions({
      dashboard: { level: 'view', on: ['viewDashboard'] },
      reports: { level: 'view', on: ['viewReports'] },
    }),
  },
]

export interface AuditEntry {
  id: string
  roleId: string
  at: string
  who: string
  what: string
}

const initialAudit: AuditEntry[] = [
  {
    id: 'A-1',
    roleId: 'anchorage-officer',
    at: '2024-05-15T14:20:00Z',
    who: 'John Doe',
    what: 'Granted Export Reports on Reports',
  },
  {
    id: 'A-2',
    roleId: 'anchorage-officer',
    at: '2024-05-14T10:05:00Z',
    who: 'John Doe',
    what: 'Assignment access level set to Read & Write',
  },
  {
    id: 'A-3',
    roleId: 'anchorage-officer',
    at: '2024-05-12T08:40:00Z',
    who: 'A. Rahman',
    what: 'Added 2 users to role',
  },
  {
    id: 'A-4',
    roleId: 'anchorage-officer',
    at: '2024-05-10T09:30:00Z',
    who: 'System',
    what: 'Role created',
  },
]

interface RolesState {
  roles: Role[]
  audit: AuditEntry[]
  selectedId: string
}

const initialState: RolesState = {
  roles: initialRoles,
  audit: initialAudit,
  selectedId: 'anchorage-officer',
}

/** "Anchorage Supervisor" -> "anchorage-supervisor", uniquified on collision. */
function slugify(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'role'
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}

export type NewRole = Omit<Role, 'id' | 'createdAt' | 'updatedAt'>

const label = (id: ModuleId) => MODULES.find((m) => m.id === id)?.label ?? id
const levelLabel = (id: AccessLevel) => ACCESS_LEVELS.find((l) => l.id === id)?.label ?? id

const rolesSlice = createSlice({
  name: 'roles',
  initialState,
  reducers: {
    selectRole(state, action: PayloadAction<string>) {
      state.selectedId = action.payload
    },
    addRole(state, action: PayloadAction<NewRole>) {
      const now = new Date().toISOString()
      const id = slugify(
        action.payload.name,
        state.roles.map((r) => r.id),
      )
      state.roles.push({ ...action.payload, id, createdAt: now, updatedAt: now })
      state.selectedId = id
      state.audit.unshift({
        id: `A-${state.audit.length + 1}`,
        roleId: id,
        at: now,
        who: 'John Doe',
        what: 'Role created',
      })
    },
    setAccessLevel(
      state,
      action: PayloadAction<{ roleId: string; module: ModuleId; level: AccessLevel }>,
    ) {
      const role = state.roles.find((r) => r.id === action.payload.roleId)
      if (!role || role.permissions[action.payload.module].level === action.payload.level) return
      role.permissions[action.payload.module].level = action.payload.level
      touch(
        state,
        role,
        `${label(action.payload.module)} access level set to ${levelLabel(action.payload.level)}`,
      )
    },
    setCapability(
      state,
      action: PayloadAction<{
        roleId: string
        module: ModuleId
        capability: string
        value: boolean
      }>,
    ) {
      const role = state.roles.find((r) => r.id === action.payload.roleId)
      if (!role) return
      const perm = role.permissions[action.payload.module]
      if (perm.capabilities[action.payload.capability] === action.payload.value) return
      perm.capabilities[action.payload.capability] = action.payload.value
      const cap = MODULES.find((m) => m.id === action.payload.module)?.capabilities.find(
        (c) => c.id === action.payload.capability,
      )
      touch(
        state,
        role,
        `${action.payload.value ? 'Granted' : 'Revoked'} ${cap?.label} on ${label(action.payload.module)}`,
      )
    },
    setModuleScope(
      state,
      action: PayloadAction<{ roleId: string; module: ModuleId; scope: string }>,
    ) {
      const role = state.roles.find((r) => r.id === action.payload.roleId)
      if (!role) return
      role.permissions[action.payload.module].scope = action.payload.scope
      touch(
        state,
        role,
        `${label(action.payload.module)} default scope set to ${action.payload.scope}`,
      )
    },
    setRoleActive(state, action: PayloadAction<{ roleId: string; active: boolean }>) {
      const role = state.roles.find((r) => r.id === action.payload.roleId)
      if (!role) return
      role.active = action.payload.active
      touch(state, role, `Role ${action.payload.active ? 'activated' : 'deactivated'}`)
    },
  },
})

/** Stamps the role and records what changed — every edit here is auditable. */
function touch(state: RolesState, role: Role, what: string) {
  role.updatedAt = new Date().toISOString()
  state.audit.unshift({
    id: `A-${state.audit.length + 1}`,
    roleId: role.id,
    at: role.updatedAt,
    who: 'John Doe',
    what,
  })
}

export const { selectRole, addRole, setAccessLevel, setCapability, setModuleScope, setRoleActive } =
  rolesSlice.actions
export default rolesSlice.reducer
