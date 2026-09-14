import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { selectModuleAccess } from '../../features/roles/selectors'
import { selectCurrentUser } from '../../features/users/selectors'
import { setUserActive, type User } from '../../features/users/usersSlice'
import { formatDateTime } from '../../utils/format'
import { FiEdit2, FiPlus, FiSearch } from 'react-icons/fi'
import RawJson from '../RawJson'
import UserDialog from '../UserDialog'

type StatusFilter = 'all' | 'active' | 'inactive'

export default function UsersScreen() {
  const dispatch = useAppDispatch()
  const users = useAppSelector((s) => s.users.users)
  const roles = useAppSelector((s) => s.roles.roles)
  const moduleAccess = useAppSelector(selectModuleAccess)
  const me = useAppSelector(selectCurrentUser)

  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  /** null = closed, 'new' = the add form, otherwise the account being edited. */
  const [dialog, setDialog] = useState<'new' | User | null>(null)

  // A role with View Only on this module can read the list and nothing else, so
  // the controls that write are not drawn rather than drawn and then refused.
  const canWrite = moduleAccess('users') === 'readwrite'

  const roleNames = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.roleId !== roleFilter) return false
      if (statusFilter === 'active' && !u.active) return false
      if (statusFilter === 'inactive' && u.active) return false
      if (!q) return true
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })
  }, [users, query, roleFilter, statusFilter])

  const activeCount = users.filter((u) => u.active).length

  const payload = {
    endpoint: 'GET /api/admin/users',
    total: users.length,
    active: activeCount,
    filters: { query: query || null, role: roleFilter, status: statusFilter },
    // Passwords are deliberately absent: even in a mock payload, an account
    // listing that carries them teaches the wrong shape for the real endpoint.
    results: shown.slice(0, 5).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roleId: u.roleId,
      active: u.active,
      createdAt: u.createdAt,
    })),
  }

  return (
    <>
      <section className="panel panel-wide">
        <h2>
          Users <span className="badge badge-ok">{users.length}</span>
          {canWrite && (
            <button
              type="button"
              className="primary-button head-action"
              onClick={() => setDialog('new')}
            >
              <FiPlus size={15} /> Add User
            </button>
          )}
        </h2>
        <p className="muted">
          Console accounts and the role each one carries. {activeCount} of {users.length} can sign
          in.
        </p>

        <div className="user-toolbar">
          <label className="user-search">
            <FiSearch size={15} />
            <input
              className="text-input"
              type="search"
              placeholder="Search name or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <select
            className="text-input"
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          <select
            className="text-input"
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">Any status</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        <table className="data-table users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              {canWrite && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {shown.map((user) => {
              // Nobody may switch off the account they are signed in with —
              // it would take their own rail away with no way back.
              const isMe = me?.id === user.id
              return (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    {isMe && <span className="user-you">you</span>}
                  </td>
                  <td className="muted">{user.email}</td>
                  <td>{roleNames.get(user.roleId) ?? user.roleId}</td>
                  <td>
                    <span className={`pill pill-${user.active ? 'anchored' : 'awaiting'}`}>
                      {user.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="muted">{formatDateTime(user.createdAt)}</td>
                  {canWrite && (
                    <td className="user-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setDialog(user)}
                      >
                        <FiEdit2 size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={isMe}
                        title={
                          isMe
                            ? 'You cannot deactivate the account you are signed in with'
                            : undefined
                        }
                        onClick={() =>
                          dispatch(setUserActive({ id: user.id, active: !user.active }))
                        }
                      >
                        {user.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {shown.length === 0 && <p className="muted">No accounts match those filters.</p>}
      </section>

      <RawJson label="GET /api/admin/users" data={payload} />

      {dialog && (
        <UserDialog user={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} />
      )}
    </>
  )
}
