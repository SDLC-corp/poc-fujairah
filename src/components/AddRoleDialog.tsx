import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { selectAreas } from '../features/analysis/selectors'
import {
  ACCESS_LEVELS,
  addRole,
  buildPermissions,
  MODULES,
  type AccessLevel,
  type ModuleId,
  type PermissionMatrix,
} from '../features/roles/rolesSlice'
import { FiInfo, FiPlus, FiUserPlus, FiX } from 'react-icons/fi'
import { LEVEL_ICONS, MODULE_ICONS } from './roleIcons'

/** Everything on, for the Select All shortcut — each module at the most it offers. */
function fullMatrix(): PermissionMatrix {
  return buildPermissions(
    Object.fromEntries(
      MODULES.map((m) => [m.id, { level: m.levels[m.levels.length - 1], on: 'all' as const }]),
    ),
  )
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
  const [permissions, setPermissions] = useState<PermissionMatrix>(() => buildPermissions())

  const anchorages = areas.filter((a) => a.properties.category === 'anchorage')

  /** A module counts as reachable once its access level is not No Access. */
  const selectedModules = useMemo(
    () => MODULES.filter((m) => permissions[m.id].level !== 'none'),
    [permissions],
  )
  const level = accessLevel(selectedModules.length)
  const valid = name.trim().length > 0 && description.trim().length > 0

  const setLevel = (module: ModuleId, value: AccessLevel) =>
    setPermissions((prev) => ({ ...prev, [module]: { ...prev[module], level: value } }))

  const setCap = (module: ModuleId, capability: string, value: boolean) =>
    setPermissions((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        capabilities: { ...prev[module].capabilities, [capability]: value },
      },
    }))

  const setAll = (on: boolean) => setPermissions(on ? fullMatrix() : buildPermissions())

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
            <FiUserPlus size={19} />
          </span>
          <div>
            <h3>Add Role</h3>
            <p className="muted">Create a new role and define its access permissions</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <FiX size={19} />
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
                  <input type="radio" checked={!active} onChange={() => setActive(false)} />{' '}
                  Inactive
                </label>
              </div>
            </div>

            <fieldset className="role-box">
              <legend>Access Scope</legend>
              <label>
                <input type="radio" checked={scope === 'port'} onChange={() => setScope('port')} />{' '}
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
          </section>

          {/* ---------- right: what the role can do ---------- */}
          <section className="role-dialog-col">
            <div className="role-dialog-perm-head">
              <div>
                <h4 className="sub-head">Module Permissions</h4>
                <p className="muted">Select modules and actions this role can access</p>
              </div>
              <div className="dialog-actions">
                <button type="button" className="ghost-button" onClick={() => setAll(true)}>
                  Select All
                </button>
                <button type="button" className="ghost-button" onClick={() => setAll(false)}>
                  Clear All
                </button>
              </div>
            </div>

            {/* The same shape as the detail screen, compressed: a level per
                module and its own capabilities beneath, rather than a grid of
                verbs that half the modules do not have. */}
            <div className="perm-rows compact">
              {MODULES.map((m) => {
                const ModuleIcon = MODULE_ICONS[m.id]
                const LevelIcon = LEVEL_ICONS[permissions[m.id].level]
                return (
                  <div key={m.id} className="perm-row">
                    <div className="perm-row-id">
                      <span className="perm-row-icon">
                        <ModuleIcon size={17} />
                      </span>
                      <span>
                        <strong>{m.label}</strong>
                        <small className="muted">{m.blurb}</small>
                      </span>
                    </div>

                    <label className="perm-row-level">
                      <span className="perm-select">
                        <LevelIcon size={15} />

                        <select
                          aria-label={`${m.label} access level`}
                          value={permissions[m.id].level}
                          onChange={(e) => setLevel(m.id, e.target.value as AccessLevel)}
                        >
                          {ACCESS_LEVELS.filter((l) => m.levels.includes(l.id)).map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </span>
                    </label>

                    <div className="perm-row-caps">
                      <div className="perm-caps">
                        {m.capabilities.map((c) => (
                          <label key={c.id} className="perm-cap">
                            <input
                              type="checkbox"
                              checked={permissions[m.id].capabilities[c.id] ?? false}
                              onChange={(e) => setCap(m.id, c.id, e.target.checked)}
                            />
                            {c.label}
                            {c.hint && (
                              <span className="perm-hint" title={c.hint} aria-label={c.hint}>
                                <FiInfo size={13} />
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

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
            <FiPlus size={15} /> Create Role
          </button>
        </footer>
      </div>
    </div>
  )
}
