import { useState } from 'react'
import { useAppDispatch } from '../app/hooks'
import {
  ACCESS_LEVELS,
  MODULES,
  setAccessLevel,
  setCapability,
  setModuleScope,
  type ModuleId,
  type PermissionMatrix,
} from '../features/roles/rolesSlice'
import { FiChevronDown, FiInfo } from 'react-icons/fi'
import { LEVEL_ICONS, MODULE_ICONS } from './roleIcons'

/**
 * The permission editor: one row per module rather than a cell grid.
 *
 * A shared Add/Edit/Delete/Approve grid forces every module through the same
 * four verbs, and most of them do not have four verbs — "reassign vessel" is
 * meaningful on Assignment and meaningless on Reports. Each row therefore
 * carries its own capabilities, and the columns that would have been empty
 * simply do not exist.
 */
export default function PermissionRows({
  roleId,
  permissions,
  editable,
}: {
  roleId: string
  permissions: PermissionMatrix
  editable: boolean
}) {
  const dispatch = useAppDispatch()
  // Rows with a scope open by default, because that select is the one control
  // a collapsed row cannot show.
  const [open, setOpen] = useState<ModuleId[]>(MODULES.filter((m) => m.scope).map((m) => m.id))

  const toggle = (id: ModuleId) =>
    setOpen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <div className="perm-rows">
      {MODULES.map((m) => {
        const perm = permissions[m.id]
        const expanded = open.includes(m.id)
        const ModuleIcon = MODULE_ICONS[m.id]
        const LevelIcon = LEVEL_ICONS[perm.level]

        return (
          <div key={m.id} className={`perm-row${expanded ? ' expanded' : ''}`}>
            <div className="perm-row-id">
              <span className="perm-row-icon">
                <ModuleIcon size={18} />
              </span>
              <span>
                <strong>{m.label}</strong>
                <small className="muted">{m.blurb}</small>
              </span>
            </div>

            <label className="perm-row-level">
              <span className="muted">Access Level</span>
              <span className="perm-select">
                <LevelIcon size={15} />
                <select
                  value={perm.level}
                  disabled={!editable}
                  onChange={(e) =>
                    dispatch(
                      setAccessLevel({
                        roleId,
                        module: m.id,
                        level: e.target.value as typeof perm.level,
                      }),
                    )
                  }
                >
                  {/* Only the levels this module offers. Dashboard and the
                      audit log are read-only by nature, so Read & Write is not
                      on the list rather than being listed and ignored. */}
                  {ACCESS_LEVELS.filter((l) => m.levels.includes(l.id)).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            <div className="perm-row-caps">
              {expanded && m.capabilities.length > 0 && (
                <p className="perm-caps-head">Collaboration &amp; Additional Permissions</p>
              )}
              <div className="perm-caps">
                {m.capabilities.map((c) => (
                  <label key={c.id} className="perm-cap">
                    <input
                      type="checkbox"
                      checked={perm.capabilities[c.id] ?? false}
                      disabled={!editable}
                      onChange={(e) =>
                        dispatch(
                          setCapability({
                            roleId,
                            module: m.id,
                            capability: c.id,
                            value: e.target.checked,
                          }),
                        )
                      }
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

            {m.scope && expanded && (
              <label className="perm-row-scope">
                <span className="muted">{m.scope.label}</span>
                <select
                  value={perm.scope ?? m.scope.options[0]}
                  disabled={!editable}
                  onChange={(e) =>
                    dispatch(setModuleScope({ roleId, module: m.id, scope: e.target.value }))
                  }
                >
                  {m.scope.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              className={`perm-row-toggle${expanded ? ' open' : ''}`}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${m.label}`}
              onClick={() => toggle(m.id)}
            >
              <FiChevronDown size={16} />
            </button>
          </div>
        )
      })}

      <p className="perm-footnote">
        <FiInfo size={15} />
        <span>
          <b>Access Level</b> defines the default scope for the module.
        </span>
        <span>
          <b>Collaboration</b> enables sharing, comments and workflow.
        </span>
        <span>
          <b>Additional Permissions</b> provide extra capabilities for the module.
        </span>
      </p>
    </div>
  )
}
