import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../app/store'
import type { TabId } from '../ui/uiSlice'
import { selectCurrentUser } from '../users/selectors'
import { MODULES, type ModuleId, type Role } from './rolesSlice'

/**
 * The role the signed-in account carries, or null if nobody is signed in.
 *
 * Resolved from the account rather than from the snapshot taken at sign-in, so
 * an administrator who changes somebody's role — or their own — sees the rail
 * follow immediately. An account deactivated mid-session grants nothing, on the
 * same principle as a deactivated role.
 */
export const selectCurrentRole = createSelector(
  [selectCurrentUser, (s: RootState) => s.auth.user, (s: RootState) => s.roles.roles],
  (account, session, roles): Role | null => {
    if (!session) return null
    if (account && !account.active) return null
    return roles.find((r) => r.id === (account?.roleId ?? session.roleId)) ?? null
  },
)

/**
 * The screens this sign-in may open.
 *
 * A tab is allowed when the module gating it grants anything at all, and a tab
 * no module claims — Help & support — is always allowed: it explains the
 * console rather than exposing any of it.
 *
 * A deactivated role grants nothing. That is the point of deactivating it: the
 * users keep the role and lose the access, rather than having to be unpicked
 * from it one at a time.
 */
export const selectAllowedTabs = createSelector([selectCurrentRole], (role): Set<TabId> => {
  const allowed = new Set<TabId>(['help'])
  if (!role || !role.active) return allowed
  for (const m of MODULES) {
    if (role.permissions[m.id]?.level === 'none') continue
    if (m.tab) allowed.add(m.tab)
    // Screens reached only from that tab ride on the same grant.
    for (const t of m.alsoTabs ?? []) allowed.add(t)
  }
  return allowed
})

/** Whether the signed-in role can reach a module at all. */
export const selectModuleAccess = createSelector([selectCurrentRole], (role) => {
  return (id: ModuleId) => (role?.active ? (role.permissions[id]?.level ?? 'none') : 'none')
})
