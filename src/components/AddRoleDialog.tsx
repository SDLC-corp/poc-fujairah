import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { selectAreas } from '../features/analysis/selectors'
import {
  addRole,
  MODULES,
  PERMISSION_ACTIONS,
  type ModuleId,
  type PermissionAction,
  type PermissionMatrix,
  type PermissionValue,
} from '../features/roles/rolesSlice'
import Icon from './Icon'

/** The five a new role can be given directly; `export` follows `view`. */
const DIALOG_ACTIONS = PERMISSION_ACTIONS.filter((a) => a.id !== 'export')

function emptyMatrix(): PermissionMatrix {
  const out = {} as PermissionMatrix
  for (const m of MODULES) {
    out[m.id] = {} as Record<PermissionAction, PermissionValue>
    for (const a of PERMISSION_ACTIONS) out[m.id][a.id] = 'none'
  }
  return out
}

/**
 * How much of the console a draft role would reach. Shown while the boxes are
 * being ticked, because "6 of 11 modules" is a much more useful summary of a
 * permission set than the grid itself.
 */
function accessLevel(count: number): { label: string; tone: 'low' | 'medium' | 'high' } {
  if (count >= 9) return { label: 'High Access', tone: 'high' }
  if (count >= 4) return { label: 'Medium Access', tone: 'medium' }
  return { label: 'Low Access', tone: 'low' }
}

export default function AddRoleDialog({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch()
  const roles = useAppSelector((s) => s.roles.roles)
  const areas = useAppSelector(selectAreas)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parentId, setParentId] = useState('')
  const [active, setActive] = useState(true)
  const [scope, setScope] = useState<'port' | 'areas'>('port')
  const [scopeAreas, setScopeAreas] = useState<string[]>([])
  const [canAssignSpots, setCanAssignSpots] = useState(true)
  const [canApproveRequests, setCanApproveRequests] = useState(true)
  const [receivesAlerts, setReceivesAlerts] = useState(false)
  const [permissions, setPermissions] = useState<PermissionMatrix>(emptyMatrix)
  const [expanded, setExpanded] = useState<ModuleId | null>(null)

  const anchorages = areas.filter((a) => a.properties.category === 'anchorage')

  /** A module counts as reachable once any action on it is allowed. */
  const selectedModules = useMemo(
    () => MODULES.filter((m) => PERMISSION_ACTIONS.some((a) => permissions[m.id][a.id] === 'allow')),
    [permissions],
  )
  const level = accessLevel(selectedModules.length)
  const valid = name.trim().length > 0 && description.trim().length > 0

  const set = (module: ModuleId, action: PermissionAction, value: PermissionValue) =>
    setPermissions((prev) => ({ ...prev, [module]: { ...prev[module], [action]: value } }))

  const setAll = (value: PermissionValue) => {
    const next = emptyMatrix()
    if (value === 'allow') {
      for (const m of MODULES) for (const a of PERMISSION_ACTIONS) next[m.id][a.id] = 'allow'
    }
    setPermissions(next)
  }

  function submit() {
    if (!valid) return
    dispatch(
      addRole({
        name: name.trim(),
        description: description.trim(),
        parentId: parentId || null,
        active,
        scope,
        areas: scope === 'areas' ? scopeAreas : [],
        canAssignSpots,
        canApproveRequests,
        receivesAlerts,
        permissions,
      }),
    )
    onClose()
  }

  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label="Add role">
      <div className="dialog-card role-dialog">
        <header className="role-dialog-head">
          <span className="role-dialog-icon">
            <Icon name="crew" size={19} />
          </span>
          <div>
            <h3>Add Role</h3>
            <p className="muted">Create a new role and define its access permissions</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="role-dialog-body">
          {/* ---------- left: who the role is ---------- */}
          <section className="role-dialog-col">
            <h4 className="sub-head">Basic Information</h4>

            <label className="field">
              <span>
                Role Name <em className="req">*</em>
              </span>
              <input
                className="text-input"
                maxLength={50}
                placeholder="Enter role name (e.g., Anchorage Supervisor)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <small className="muted count">{name.length}/50</small>
            </label>

            <label className="field">
              <span>
                Description <em className="req">*</em>
              </span>
              <textarea
                className="text-input"
                rows={3}
                maxLength={200}
                placeholder="Enter short description about this role…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <small className="muted count">{description.length}/200</small>
            </label>

            <label className="field">
              <span title="A child role inherits everything its parent grants.">Parent Role</span>
              <select
                className="text-input"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">Select parent role (optional)</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="field">
              <span>Status</span>
              <div className="radio-row">
                <label>
                  <input type="radio" checked={active} onChange={() => setActive(true)} /> Active
                </label>
                <label>
                  <input type="radio" checked={!active} onChange={() => setActive(false)} /> Inactive
                </label>
              </div>
            </div>

            <fieldset className="role-box">
              <legend>Access Scope</legend>
              <label>
                <input
                  type="radio"
                  checked={scope === 'port'}
                  onChange={() => setScope('port')}
                />{' '}
                <strong>Port Wide</strong> <span className="muted">(All Anchorage Areas)</span>
              </label>
              <label>
                <input
                  type="radio"
                  checked={scope === 'areas'}
                  onChange={() => setScope('areas')}
                />{' '}
                Specific Areas Only
              </label>
              {scope === 'areas' && (
                <div className="area-chips">
                  {anchorages.map((a) => {
                    const code = a.properties.code
                    const on = scopeAreas.includes(code)
                    return (
                      <button
                        key={a.properties.id}
                        type="button"
                        className={`filter-chip chip-labelled${on ? ' active' : ''}`}
                        onClick={() =>
                          setScopeAreas((prev) =>
                            on ? prev.filter((c) => c !== code) : [...prev, code],
                          )
                        }
                      >
                        {code}
                      </button>
                    )
                  })}
                </div>
              )}
            </fieldset>

            <fieldset className="role-box">
              <legend>Additional Settings</legend>
              <label>
                <input
                  type="checkbox"
                  checked={canAssignSpots}
                  onChange={(e) => setCanAssignSpots(e.target.checked)}
                />{' '}
                Can assign spots
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={canApproveRequests}
                  onChange={(e) => setCanApproveRequests(e.target.checked)}
                />{' '}
                Can approve vessel requests
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={receivesAlerts}
                  onChange={(e) => setReceivesAlerts(e.target.checked)}
                />{' '}
                Receive system alerts for this role
              </label>
            </fieldset>
          </section>

          {/* ---------- right: what the role can do ---------- */}
          <section className="role-dialog-col">
            <div className="role-dialog-perm-head">
              <div>
                <h4 className="sub-head">Module Permissions</h4>
                <p className="muted">Select modules and actions this role can access</p>
              </div>
              <div className="dialog-actions">
                <button type="button" className="ghost-button" onClick={() => setAll('allow')}>
                  Select All
                </button>
                <button type="button" className="ghost-button" onClick={() => setAll('none')}>
                  Clear All
                </button>
              </div>
            </div>

            <table className="data-table perm-table">
              <thead>
                <tr>
                  <th>Module</th>
                  {DIALOG_ACTIONS.map((a) => (
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
                      <button
                        type="button"
                        className="perm-module"
                        aria-expanded={expanded === m.id}
                        onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                      >
                        <Icon name={m.icon} size={16} />
                        <span>
                          <strong>{m.label}</strong>
                          {expanded === m.id && <small className="muted">{m.blurb}</small>}
                        </span>
                      </button>
                    </td>
                    {DIALOG_ACTIONS.map((a) => (
                      <td key={a.id} className="perm-col">
                        <input
                          type="checkbox"
                          aria-label={`${a.label} ${m.label}`}
                          checked={permissions[m.id][a.id] === 'allow'}
                          onChange={(e) => set(m.id, a.id, e.target.checked ? 'allow' : 'none')}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="role-dialog-summary">
              <strong>
                Selected: {selectedModules.length} of {MODULES.length} modules
              </strong>
              <span className="muted">
                Estimated access:{' '}
                {selectedModules.length >= 9
                  ? 'Administrator'
                  : selectedModules.length >= 4
                    ? 'Operator level'
                    : 'Limited'}
              </span>
              <span className={`badge badge-${level.tone}`}>{level.label}</span>
            </p>
          </section>
        </div>

        <footer className="dialog-actions role-dialog-foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!valid} onClick={submit}>
            + Create Role
          </button>
        </footer>
      </div>
    </div>
  )
}
