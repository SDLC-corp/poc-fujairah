import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../app/store'
import type { User } from './usersSlice'

const selectUsers = (s: RootState) => s.users.users

/**
 * Accounts grouped by the role they carry.
 *
 * The Roles screen counts its headcount off this rather than storing a number
 * beside the role, so reassigning somebody moves both figures at once.
 */
export const selectUsersByRole = createSelector([selectUsers], (users) => {
  const byRole = new Map<string, User[]>()
  for (const user of users) {
    const held = byRole.get(user.roleId)
    if (held) held.push(user)
    else byRole.set(user.roleId, [user])
  }
  return byRole
})

/**
 * The live account behind the session, or null if the session does not match
 * one. Read rather than the snapshot in `auth`, so an account renamed or given
 * a different role on the Users screen takes effect without signing out.
 */
export const selectCurrentUser = createSelector(
  [selectUsers, (s: RootState) => s.auth.user],
  (users, session): User | null =>
    session ? (users.find((u) => u.email === session.email) ?? null) : null,
)
