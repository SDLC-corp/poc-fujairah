import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  addUser,
  DEFAULT_PASSWORD,
  emailTaken,
  MIN_PASSWORD_LENGTH,
  updateUser,
  type User,
} from '../features/users/usersSlice'
import { FiEdit2, FiRotateCcw, FiUserPlus, FiX } from 'react-icons/fi'

/**
 * Loose on purpose. Validating an address properly means sending mail to it;
 * anything stricter than "something, an @, something with a dot" starts
 * rejecting addresses that work.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Add or edit one account. The same form for both, because the fields are the
 * same ones and a separate editor drifts out of step with the creator.
 */
export default function UserDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const dispatch = useAppDispatch()
  const users = useAppSelector((s) => s.users.users)
  const roles = useAppSelector((s) => s.roles.roles)

  const editing = user !== null

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  // New accounts open on the shared starter password, so adding somebody is one
  // field shorter and the administrator has something to read out to them.
  const [password, setPassword] = useState(user?.password ?? DEFAULT_PASSWORD)
  const [roleId, setRoleId] = useState(user?.roleId ?? '')
  const [active, setActive] = useState(user?.active ?? true)
  const [showPassword, setShowPassword] = useState(!editing)

  const trimmedEmail = email.trim().toLowerCase()
  const wellFormed = EMAIL_RE.test(trimmedEmail)
  const duplicate = wellFormed && emailTaken(users, trimmedEmail, user?.id)

  /**
   * Only complain about a field once it has something in it. An empty form is
   * not yet wrong, it is unfinished — the disabled button says that already.
   */
  const emailError = !email.trim()
    ? null
    : !wellFormed
      ? 'Enter a valid email address.'
      : duplicate
        ? 'Another account already uses this address.'
        : null

  const passwordError =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      : null

  const valid =
    name.trim().length > 0 &&
    wellFormed &&
    !duplicate &&
    password.length >= MIN_PASSWORD_LENGTH &&
    roleId.length > 0

  function submit() {
    if (!valid) return

    if (user) {
      dispatch(
        updateUser({
          id: user.id,
          changes: { name, email: trimmedEmail, password, roleId, active },
        }),
      )
    } else {
      dispatch(addUser({ name, email: trimmedEmail, password, roleId, active }))
    }
    onClose()
  }

  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Edit user' : 'Add user'}
    >
      <div className="dialog-card user-dialog">
        <header className="role-dialog-head">
          <span className="role-dialog-icon">
            {editing ? <FiEdit2 size={18} /> : <FiUserPlus size={19} />}
          </span>
          <div>
            <h3>{editing ? 'Edit User' : 'Add User'}</h3>
            <p className="muted">
              {editing
                ? 'Change the account details, the role it carries, or whether it can sign in'
                : 'Create a console account and choose the role it carries'}
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <FiX size={19} />
          </button>
        </header>

        <div className="user-dialog-body">
          <label className="field">
            <span>
              Full Name <em className="req">*</em>
            </span>
            <input
              className="text-input"
              maxLength={60}
              placeholder="e.g. Capt. R. Al Hammadi"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="field">
            <span>
              Email <em className="req">*</em>
            </span>
            <input
              className="text-input"
              type="email"
              autoComplete="off"
              placeholder="name@fujairahport.ae"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailError && <small className="field-error">{emailError}</small>}
            {!emailError && <small className="muted field-note">This is what they sign in with.</small>}
          </label>

          <label className="field">
            <span>
              Password <em className="req">*</em>
            </span>
            <div className="user-password">
              <input
                className="text-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="ghost-button"
                title="Set back to the shared starter password"
                onClick={() => {
                  setPassword(DEFAULT_PASSWORD)
                  setShowPassword(true)
                }}
              >
                <FiRotateCcw size={14} /> Reset
              </button>
            </div>
            {passwordError ? (
              <small className="field-error">{passwordError}</small>
            ) : (
              <small className="muted field-note">
                {password === DEFAULT_PASSWORD
                  ? 'Using the default starter password.'
                  : 'Custom password.'}
              </small>
            )}
          </label>

          <label className="field">
            <span>
              Role <em className="req">*</em>
            </span>
            <select
              className="text-input"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              <option value="">Select a role…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
            <small className="muted field-note">
              The role decides which screens this account is offered.
            </small>
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
            <small className="muted field-note">
              An inactive account keeps its role and its history but cannot sign in.
            </small>
          </div>
        </div>

        <footer className="dialog-actions role-dialog-foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!valid} onClick={submit}>
            {editing ? 'Save Changes' : 'Create User'}
          </button>
        </footer>
      </div>
    </div>
  )
}
