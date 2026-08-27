import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  MODULES,
  PERMISSION_ACTIONS,
  selectRole,
  setPermission,
  setRoleActive,
} from '../../features/roles/rolesSlice'
import { formatDateTime } from '../../utils/format'
import AddRoleDialog from '../AddRoleDialog'
import Icon from '../Icon'
import RawJson from '../RawJson'

type DetailTab = 'details' | 'users' | 'audit'

/** Stand-in holders for a role, so the Users tab has something real to list. */
const HOLDERS = [
  'John Doe',
  'A. Rahman',
  'S. Menon',
  'K. Al Blooshi',
  'M. Farouk',
  'L. Pereira',
  'T. Nakamura',
  'R. Osei',
  'H. Al Zaabi',
  'D. Kowalski',
]

export default function RolesScreen() {
  const dispatch = useAppDispatch()
  const roles = useAppSelector((s) => s.roles.roles)
  const audit = useAppSelector((s) => s.roles.audit)
  const selectedId = useAppSelector((s) => s.roles.selectedId)
  const [tab, setTab] = useState<DetailTab>('details')
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)

  const byId = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles])
  const active = byId.get(selectedId) ?? roles[0]

  const roleAudit = audit.filter((a) => a.roleId === active?.id)

  if (!active) return null

  const payload = {
    endpoint: 'GET /api/admin/roles',
    count: roles.length,
    selected: {
      id: active.id,
      name: active.name,
      parent: active.parentId,
      users: active.users,
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
            + Add Role
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
              const granted = MODULES.filter((m) =>
                PERMISSION_ACTIONS.some((a) => role.permissions[m.id][a.id] === 'allow'),
              ).length
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
                  <td>{role.users}</td>
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
              ['users', `Users (${active.users})`],
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
                <div>
                  <dt>Also Granted</dt>
                  <dd>
                    {[
                      active.canAssignSpots && 'assign spots',
                      active.canApproveRequests && 'approve vessel requests',
                      active.receivesAlerts && 'receive system alerts',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'Nothing beyond the module permissions'}
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
                  {editing ? 'Done' : 'Edit Permissions'}
                </button>
              </div>

              <div className="perm-scroll">
                <table className="data-table perm-table">
                  <thead>
                    <tr>
                      <th>Module / feature</th>
                      {PERMISSION_ACTIONS.map((a) => (
                        <th key={a.id} className="perm-col">
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <span className="perm-module">
                            <Icon name={m.icon} size={16} />
                            <span>
                              <strong>{m.label}</strong>
                              <small className="muted">{m.blurb}</small>
                            </span>
                          </span>
                        </td>
                        {PERMISSION_ACTIONS.map((a) => (
                          <td key={a.id} className="perm-col">
                            <PermissionCell
                              value={active.permissions[m.id][a.id]}
                              editable={editing}
                              label={`${a.label} ${m.label}`}
                              onChange={(value) =>
                                dispatch(
                                  setPermission({
                                    roleId: active.id,
                                    module: m.id,
                                    action: a.id,
                                    value,
                                  }),
                                )
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="perm-legend">
                <span>
                  <b className="perm-allow">✓</b> Allow
                </span>
                <span>
                  <b className="perm-none">—</b> No Access
                </span>
                <span>
                  <b className="perm-inherited">⊕</b> Permission inherited
                </span>
              </p>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <ul className="role-users">
            {Array.from({ length: active.users }, (_, i) => (
              <li key={i}>
                <Icon name="crew" size={16} />
                <span>
                  <strong>{HOLDERS[i % HOLDERS.length]}</strong>
                  <small className="muted">{active.name}</small>
                </span>
              </li>
            ))}
            {active.users === 0 && <p className="muted">No users hold this role yet.</p>}
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

/**
 * One square of the matrix. Read-only it is a glyph, so a 66-cell grid stays
 * scannable; under Edit permissions it becomes a checkbox. An inherited cell
 * is left alone by the checkbox — clearing it would silently convert "ask the
 * parent" into "denied here", which is a different and stickier decision.
 */
function PermissionCell({
  value,
  editable,
  label,
  onChange,
}: {
  value: 'allow' | 'none' | 'inherited'
  editable: boolean
  label: string
  onChange: (value: 'allow' | 'none') => void
}) {
  if (value === 'inherited') {
    return (
      <span className="perm-inherited" title="Inherited from the parent role">
        ⊕
      </span>
    )
  }
  if (!editable) {
    return (
      <span className={value === 'allow' ? 'perm-allow' : 'perm-none'}>
        {value === 'allow' ? '✓' : '—'}
      </span>
    )
  }
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={value === 'allow'}
      onChange={(e) => onChange(e.target.checked ? 'allow' : 'none')}
    />
  )
}
