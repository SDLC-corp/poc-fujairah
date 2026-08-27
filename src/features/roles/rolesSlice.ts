import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

/**
 * Role-based access control for the console.
 *
 * Roles form a tree: a child inherits everything its parent grants and may
 * narrow but not widen it. That is why a permission has three states rather
 * than a checkbox — `inherited` means "whatever the parent says", and is what
 * keeps a hierarchy editable without restating the whole matrix on every role.
 */

export type PermissionAction = 'view' | 'add' | 'edit' | 'delete' | 'approve' | 'export'

export const PERMISSION_ACTIONS: { id: PermissionAction; label: string }[] = [
  { id: 'view', label: 'View' },
  { id: 'add', label: 'Add' },
  { id: 'edit', label: 'Edit' },
  { id: 'delete', label: 'Delete' },
  { id: 'approve', label: 'Approve' },
  { id: 'export', label: 'Export' },
]

export type ModuleId =
  | 'dashboard'
  | 'liveAnchorage'
  | 'vesselRequests'
  | 'assignment'
  | 'vesselTracking'
  | 'playback'
  | 'alerts'
  | 'reports'
  | 'users'
  | 'roles'
  | 'settings'

export const MODULES: { id: ModuleId; label: string; blurb: string; icon: string }[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    blurb: 'Access to overview dashboards',
    icon: 'dashboard',
  },
  {
    id: 'liveAnchorage',
    label: 'Live Anchorage',
    blurb: 'View live vessel positions',
    icon: 'anchor',
  },
  {
    id: 'vesselRequests',
    label: 'Vessel Requests',
    blurb: 'Manage anchoring requests',
    icon: 'reports',
  },
  {
    id: 'assignment',
    label: 'Assignment',
    blurb: 'Assign and manage vessel spots',
    icon: 'assignment',
  },
  {
    id: 'vesselTracking',
    label: 'Vessel Tracking',
    blurb: 'Real-time vessel tracking',
    icon: 'tracking',
  },
  { id: 'playback', label: 'Playback', blurb: 'Historical data playback', icon: 'playback' },
  { id: 'alerts', label: 'Alerts', blurb: 'Manage system alerts', icon: 'alert' },
  { id: 'reports', label: 'Reports', blurb: 'Access analytics and reports', icon: 'reports' },
  { id: 'users', label: 'Users', blurb: 'Manage system users', icon: 'crew' },
  {
    id: 'roles',
    label: 'Roles & Permissions',
    blurb: 'Manage roles and permissions',
    icon: 'roles',
  },
  { id: 'settings', label: 'Settings', blurb: 'System configuration', icon: 'settings' },
]

/** `inherited` defers to the parent role; the other two are set on this role. */
export type PermissionValue = 'allow' | 'none' | 'inherited'

/**
 * Grants that are not module actions. They belong to the workflow rather than
 * to a screen — a role may be able to see the assignment module without being
 * the one who commits an assignment — so they sit beside the matrix, not in it.
 */
export type RoleSettingKey = 'canAssignSpots' | 'canApproveRequests' | 'receivesAlerts'

export const ROLE_SETTINGS: { key: RoleSettingKey; label: string; blurb: string }[] = [
  {
    key: 'canAssignSpots',
    label: 'Can assign spots',
    blurb: 'Commit a vessel to an anchorage spot',
  },
  {
    key: 'canApproveRequests',
    label: 'Can approve vessel requests',
    blurb: 'Accept or refuse an anchoring request',
  },
  {
    key: 'receivesAlerts',
    label: 'Receive system alerts',
    blurb: 'Incidents and incursions are routed to this role',
  },
]

export type PermissionMatrix = Record<ModuleId, Record<PermissionAction, PermissionValue>>

export interface Role {
  id: string
  name: string
  description: string
  /** Null for a root role. */
  parentId: string | null
  users: number
  active: boolean
  createdAt: string
  updatedAt: string
  /** Port-wide, or restricted to named anchorage areas. */
  scope: 'port' | 'areas'
  areas: string[]
  canAssignSpots: boolean
  canApproveRequests: boolean
  receivesAlerts: boolean
  permissions: PermissionMatrix
}

/** Builds a full matrix from a sparse description, defaulting the rest. */
function matrix(
  fallback: PermissionValue,
  overrides: Partial<Record<ModuleId, Partial<Record<PermissionAction, PermissionValue>>>> = {},
): PermissionMatrix {
  const out = {} as PermissionMatrix
  for (const m of MODULES) {
    out[m.id] = {} as Record<PermissionAction, PermissionValue>
    for (const a of PERMISSION_ACTIONS) {
      out[m.id][a.id] = overrides[m.id]?.[a.id] ?? fallback
    }
  }
  return out
}

const ALL = matrix('allow')

/** The read-only shape: look at everything, change nothing. */
const READ_ONLY = matrix('none', {
  dashboard: { view: 'allow', export: 'allow' },
  liveAnchorage: { view: 'allow' },
  vesselTracking: { view: 'allow' },
  playback: { view: 'allow' },
  reports: { view: 'allow', export: 'allow' },
})

const ADMIN_INHERITED = {
  view: 'none',
  add: 'inherited',
  edit: 'inherited',
  delete: 'inherited',
  approve: 'inherited',
  export: 'inherited',
} as const

const initialRoles: Role[] = [
  {
    id: 'harbour-master',
    name: 'Harbour Master',
    description: 'Full access to all modules and settings',
    parentId: null,
    users: 3,
    active: true,
    createdAt: '2024-05-10T09:30:00Z',
    updatedAt: '2024-05-15T14:20:00Z',
    scope: 'port',
    areas: [],
    canAssignSpots: true,
    canApproveRequests: true,
    receivesAlerts: true,
    permissions: ALL,
  },
  {
    id: 'deputy-harbour-master',
    name: 'Deputy Harbour Master',
    description: 'Access to operations and approvals',
    parentId: 'harbour-master',
    users: 5,
    active: true,
    createdAt: '2024-05-10T09:34:00Z',
    updatedAt: '2024-05-14T11:05:00Z',
    scope: 'port',
    areas: [],
    canAssignSpots: true,
    canApproveRequests: true,
    receivesAlerts: true,
    permissions: matrix('allow', { settings: ADMIN_INHERITED, roles: ADMIN_INHERITED }),
  },
  {
    id: 'port-control-operator',
    name: 'Port Control Operator',
    description: 'Monitor and manage vessel operations',
    parentId: 'deputy-harbour-master',
    users: 8,
    active: true,
    createdAt: '2024-05-10T09:40:00Z',
    updatedAt: '2024-05-13T08:15:00Z',
    scope: 'port',
    areas: [],
    canAssignSpots: false,
    canApproveRequests: false,
    receivesAlerts: true,
    permissions: matrix('none', {
      dashboard: { view: 'allow', export: 'allow' },
      liveAnchorage: { view: 'allow', edit: 'allow' },
      vesselRequests: { view: 'allow', add: 'allow', edit: 'allow' },
      vesselTracking: { view: 'allow', export: 'allow' },
      playback: { view: 'allow' },
      alerts: { view: 'allow', approve: 'allow' },
      reports: { view: 'allow', export: 'allow' },
    }),
  },
  {
    id: 'anchorage-officer',
    name: 'Anchorage Officer',
    description: 'Manage anchorage assignments',
    parentId: 'deputy-harbour-master',
    users: 6,
    active: true,
    createdAt: '2024-05-10T09:30:00Z',
    updatedAt: '2024-05-15T14:20:00Z',
    scope: 'port',
    areas: [],
    canAssignSpots: true,
    canApproveRequests: true,
    receivesAlerts: false,
    // The matrix drawn on the design: full control of the anchorage workflow,
    // read-only on tracking and playback, and the admin modules left to the
    // parent rather than granted here.
    permissions: matrix('none', {
      dashboard: {
        view: 'allow',
        add: 'allow',
        edit: 'allow',
        delete: 'allow',
        approve: 'allow',
        export: 'allow',
      },
      liveAnchorage: {
        view: 'allow',
        add: 'allow',
        edit: 'allow',
        delete: 'allow',
        approve: 'allow',
        export: 'allow',
      },
      vesselRequests: {
        view: 'allow',
        add: 'allow',
        edit: 'allow',
        delete: 'allow',
        approve: 'allow',
        export: 'allow',
      },
      assignment: { view: 'allow', add: 'allow', edit: 'allow', delete: 'allow', export: 'allow' },
      vesselTracking: { view: 'allow', export: 'allow' },
      playback: { view: 'allow' },
      alerts: { view: 'allow', approve: 'allow' },
      reports: { view: 'allow', export: 'allow' },
      users: ADMIN_INHERITED,
      roles: ADMIN_INHERITED,
      settings: ADMIN_INHERITED,
    }),
  },
  {
    id: 'tug-operator',
    name: 'Tug Operator',
    description: 'View relevant operations and vessels',
    parentId: 'anchorage-officer',
    users: 4,
    active: true,
    createdAt: '2024-05-11T07:12:00Z',
    updatedAt: '2024-05-12T16:40:00Z',
    scope: 'areas',
    areas: ['T', 'BN'],
    canAssignSpots: false,
    canApproveRequests: false,
    receivesAlerts: true,
    permissions: matrix('none', {
      dashboard: { view: 'allow' },
      liveAnchorage: { view: 'allow' },
      assignment: { view: 'allow' },
      vesselTracking: { view: 'allow' },
      alerts: { view: 'allow' },
    }),
  },
  {
    id: 'vts-operator',
    name: 'VTS Operator',
    description: 'Vessel tracking and traffic monitoring',
    parentId: 'harbour-master',
    users: 7,
    active: true,
    createdAt: '2024-05-10T10:02:00Z',
    updatedAt: '2024-05-15T09:55:00Z',
    scope: 'port',
    areas: [],
    canAssignSpots: false,
    canApproveRequests: false,
    receivesAlerts: true,
    permissions: matrix('none', {
      dashboard: { view: 'allow' },
      liveAnchorage: { view: 'allow', edit: 'allow' },
      vesselTracking: { view: 'allow', edit: 'allow', export: 'allow' },
      playback: { view: 'allow', export: 'allow' },
      alerts: { view: 'allow', add: 'allow', approve: 'allow' },
      reports: { view: 'allow', export: 'allow' },
    }),
  },
  {
    id: 'read-only',
    name: 'Read Only',
    description: 'View access to dashboards and reports',
    parentId: null,
    users: 10,
    active: true,
    createdAt: '2024-05-10T10:15:00Z',
    updatedAt: '2024-05-10T10:15:00Z',
    scope: 'port',
    areas: [],
    canAssignSpots: false,
    canApproveRequests: false,
    receivesAlerts: false,
    permissions: READ_ONLY,
  },
  {
    id: 'external-stakeholder',
    name: 'External Stakeholder',
    description: 'Limited access to shared information',
    parentId: null,
    users: 2,
    active: false,
    createdAt: '2024-05-11T13:45:00Z',
    updatedAt: '2024-05-11T13:45:00Z',
    scope: 'areas',
    areas: ['A'],
    canAssignSpots: false,
    canApproveRequests: false,
    receivesAlerts: false,
    permissions: matrix('none', { dashboard: { view: 'allow' }, reports: { view: 'allow' } }),
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
    what: 'Granted Export on Reports',
  },
  {
    id: 'A-2',
    roleId: 'anchorage-officer',
    at: '2024-05-14T10:05:00Z',
    who: 'John Doe',
    what: 'Revoked Approve on Assignment',
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

export type NewRole = Omit<Role, 'id' | 'users' | 'createdAt' | 'updatedAt'>

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
      state.roles.push({ ...action.payload, id, users: 0, createdAt: now, updatedAt: now })
      state.selectedId = id
      state.audit.unshift({
        id: `A-${state.audit.length + 1}`,
        roleId: id,
        at: now,
        who: 'John Doe',
        what: 'Role created',
      })
    },
    setPermission(
      state,
      action: PayloadAction<{
        roleId: string
        module: ModuleId
        action: PermissionAction
        value: PermissionValue
      }>,
    ) {
      const role = state.roles.find((r) => r.id === action.payload.roleId)
      if (!role) return
      const previous = role.permissions[action.payload.module][action.payload.action]
      if (previous === action.payload.value) return
      role.permissions[action.payload.module][action.payload.action] = action.payload.value
      role.updatedAt = new Date().toISOString()
      const moduleLabel = MODULES.find((m) => m.id === action.payload.module)?.label
      const actionLabel = PERMISSION_ACTIONS.find((a) => a.id === action.payload.action)?.label
      state.audit.unshift({
        id: `A-${state.audit.length + 1}`,
        roleId: role.id,
        at: role.updatedAt,
        who: 'John Doe',
        what: `${action.payload.value === 'allow' ? 'Granted' : 'Revoked'} ${actionLabel} on ${moduleLabel}`,
      })
    },
    /**
     * The three grants that sit outside the module matrix. They are set on the
     * Add Role dialog, so they have to be changeable afterwards too — a setting
     * you can only choose at creation is a setting you cannot correct.
     */
    setRoleSetting(
      state,
      action: PayloadAction<{ roleId: string; key: RoleSettingKey; value: boolean }>,
    ) {
      const role = state.roles.find((r) => r.id === action.payload.roleId)
      if (!role || role[action.payload.key] === action.payload.value) return
      role[action.payload.key] = action.payload.value
      role.updatedAt = new Date().toISOString()
      state.audit.unshift({
        id: `A-${state.audit.length + 1}`,
        roleId: role.id,
        at: role.updatedAt,
        who: 'John Doe',
        what: `${action.payload.value ? 'Granted' : 'Revoked'} ${ROLE_SETTINGS.find((s) => s.key === action.payload.key)?.label}`,
      })
    },
    setRoleActive(state, action: PayloadAction<{ roleId: string; active: boolean }>) {
      const role = state.roles.find((r) => r.id === action.payload.roleId)
      if (!role) return
      role.active = action.payload.active
      role.updatedAt = new Date().toISOString()
    },
  },
})

export const { selectRole, addRole, setPermission, setRoleSetting, setRoleActive } =
  rolesSlice.actions
export default rolesSlice.reducer
