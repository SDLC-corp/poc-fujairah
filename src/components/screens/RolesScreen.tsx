import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { MODULES, selectRole, setRoleActive } from '../../features/roles/rolesSlice'
import { selectUsersByRole } from '../../features/users/selectors'
import { formatDateTime } from '../../utils/format'
import AddRoleDialog from '../AddRoleDialog'
import { FiEdit2, FiPlus, FiUser } from 'react-icons/fi'
import PermissionRows from '../PermissionRows'
import RawJson from '../RawJson'

type DetailTab = 'details' | 'users' | 'audit'

export default function RolesScreen() {
  const dispatch = useAppDispatch()
  const roles = useAppSelector((s) => s.roles.roles)
  const audit = useAppSelector((s) => s.roles.audit)
  const selectedId = useAppSelector((s) => s.roles.selectedId)
  // Who holds a role is read off the accounts rather than a number stored
  // beside it, so this stays right as users are added and reassigned.
  const usersByRole = useAppSelector(selectUsersByRole)
  const [tab, setTab] = useState<DetailTab>('details')
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)

  /**
   * Edit mode belongs to the role it was opened on, so picking a different one
   * closes it. Leaving it open would carry an armed editor onto a role the
   * operator only meant to look at — and every control in it writes an audit
   * entry the moment it is touched.
   *
   * Adjusted during render rather than in an effect: the reset has to happen
   * before the new role is drawn, and it has to cover being moved by the store
   * as well as by a click, which `addRole` does when it selects what it made.
   */
  const [editingFor, setEditingFor] = useState(selectedId)
  if (editingFor !== selectedId) {
    setEditingFor(selectedId)
    setEditing(false)
  }

  const byId = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const active = byId.get(selectedId) ?? roles[0]

  const roleAudit = audit.filter((a) => a.roleId === active?.id)
  const roleUsers = usersByRole.get(active?.id ?? '') ?? []

  if (!active) return null

  const payload = {
    endpoint: 'GET /api/admin/roles',
    count: roles.length,
    selected: {
      id: active.id,
      name: active.name,
      parent: active.parentId,
      users: roleUsers.length,
      scope: active.scope,
      areas: active.areas,
      permissions: active.permissions,
    },
  }

  // App already wraps a data screen in `.screen-scroll > .screen-grid`, so this
  // returns bare panels. Wrapping them again nests the whole screen inside one
  // `minmax(330px, 1fr)` column of that grid, which is what squeezed it into a
  // narrow strip down the left.
  return (
    <>
      {/* ---------- the roles themselves ---------- */}
      <section className="panel panel-wide">
        <h2>
          Roles <span className="badge badge-ok">{roles.length}</span>
          <button
            type="button"
            className="primary-button head-action"
            onClick={() => setAdding(true)}
          >
            <FiPlus size={15} /> Add Role
          </button>
        </h2>
        <p className="muted">Create and manage user roles and their access.</p>

        <table className="data-table roles-table">
          <thead>
            <tr>
              <th>Role name</th>
              <th>Description</th>
              <th title="A child role inherits everything its parent grants.">Parent role</th>
              <th>Users</th>
              <th>Status</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              // A module counts as reachable once its access level is anything
              // other than No Access — the capabilities beneath it are refinements.
              const granted = MODULES.filter((m) => role.permissions[m.id].level !== 'none').length
              return (
                <tr
                  key={role.id}
                  className={role.id === selectedId ? 'row-selected' : ''}
                  onClick={() => dispatch(selectRole(role.id))}
                >
                  <td>
                    <strong>{role.name}</strong>
                  </td>
                  <td className="muted">{role.description}</td>
                  <td className="muted">{role.parentId ? byId.get(role.parentId)?.name : '—'}</td>
                  <td>{(usersByRole.get(role.id) ?? []).length}</td>
                  <td>
                    <span className={`pill pill-${role.active ? 'anchored' : 'awaiting'}`}>
                      {role.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="muted">
                    {granted}/{MODULES.length} modules
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {/* ---------- the selected role: who it is, beside what it can do ----------
          One panel rather than two, because the matrix on the right is only
          readable next to the name and scope on the left — split across
          separate cards they scroll apart and stop describing each other. */}
      <section className="panel panel-wide role-detail">
        {/* The tab bar spans the card and switches the whole lower half, so
            Role Details shows the identity and the matrix together — they only
            mean anything read side by side. */}
        <div className="role-tabbar" role="tablist">
          {(
            [
              ['details', 'Role Details'],
              ['users', `Users (${roleUsers.length})`],
              ['audit', 'Audit Log'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`role-tab${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'details' && (
          <div className="role-detail-row">
            <div className="role-detail-col">
              <h3 className="sub-head">Role Information</h3>
              <dl className="role-facts">
                <div>
                  <dt>Role Name</dt>
                  <dd className="fact-strong">{active.name}</dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>{active.description}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <label className="fact-status">
                      <input
                        type="checkbox"
                        checked={active.active}
                        onChange={(e) =>
                          dispatch(setRoleActive({ roleId: active.id, active: e.target.checked }))
                        }
                      />
                      <span className={active.active ? 'dot-active' : 'dot-inactive'} />
                      {active.active ? 'Active' : 'Inactive'}
                    </label>
                  </dd>
                </div>
                <div>
                  <dt>Created On</dt>
                  <dd>{formatDateTime(active.createdAt)}</dd>
                </div>
                <div>
                  <dt>Last Updated</dt>
                  <dd>{formatDateTime(active.updatedAt)}</dd>
                </div>
                <div>
                  <dt>Access Scope</dt>
                  <dd>
                    {active.scope === 'port'
                      ? 'Port wide — all anchorage areas'
                      : `Areas ${active.areas.join(', ') || '—'}`}
                  </dd>
                </div>
              </dl>
            </div>

            {/* ---------- the matrix ---------- */}
            <div className="role-detail-col">
              <div className="role-perm-head">
                <h3 className="sub-head">Permissions</h3>
                <button
                  type="button"
                  className={`ghost-button head-action${editing ? ' active' : ''}`}
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? (
                    'Done'
                  ) : (
                    <>
                      <FiEdit2 size={14} /> Edit Permissions
                    </>
                  )}
                </button>
              </div>

              <PermissionRows
                roleId={active.id}
                permissions={active.permissions}
                editable={editing}
              />
            </div>
          </div>
        )}

        {tab === 'users' && (
          <ul className="role-users">
            {roleUsers.map((user) => (
              <li key={user.id}>
                <FiUser size={16} />
                <span>
                  <strong>{user.name}</strong>
                  <small className="muted">{user.email}</small>
                </span>
                {!user.active && <span className="pill pill-awaiting">Inactive</span>}
              </li>
            ))}
            {roleUsers.length === 0 && <p className="muted">No users hold this role yet.</p>}
          </ul>
        )}

        {tab === 'audit' && (
          <ul className="role-audit">
            {roleAudit.map((entry) => (
              <li key={entry.id}>
                <span className="muted">{formatDateTime(entry.at)}</span>
                <span>{entry.what}</span>
                <small className="muted">{entry.who}</small>
              </li>
            ))}
            {roleAudit.length === 0 && <p className="muted">Nothing recorded for this role.</p>}
          </ul>
        )}
      </section>

      <RawJson label="GET /api/admin/roles" data={payload} />

      {adding && <AddRoleDialog onClose={() => setAdding(false)} />}
    </>
  )
}
