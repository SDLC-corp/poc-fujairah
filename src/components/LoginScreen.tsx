import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { signIn, clearAuthError, DEMO_EMAIL, DEMO_PASSWORD } from '../features/auth/authSlice'

export default function LoginScreen() {
  const dispatch = useAppDispatch()
  const error = useAppSelector((s) => s.auth.error)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    dispatch(signIn({ email, password }))
  }

  function fillDemo() {
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    dispatch(clearAuthError())
  }

  return (
    <div className="login">
      <div className="login-brand">
        <div className="login-brand-inner">
          <span className="login-mark">PoF</span>
          <h1>Port of Fujairah</h1>
          <p className="login-tagline">
            Real-time monitoring &amp; tracking — occupancy, anchorage assignment and berthing.
          </p>
          <ul className="login-points">
            <li>Live vessel positions across anchorage areas A, B and C</li>
            <li>Occupancy and capacity at a glance</li>
            <li>Anchroage workflow</li>
          </ul>
          <span className="login-note">Proof of concept — sample data</span>
        </div>
      </div>

      <div className="login-form-pane">
        <form className="login-card" onSubmit={handleSubmit}>
          <h2>Sign in</h2>
          <p className="login-sub">Operations console access</p>

          <label className="login-field" htmlFor="login-email">
            <span>Email</span>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) dispatch(clearAuthError())
              }}
              required
            />
          </label>

          <label className="login-field" htmlFor="login-password">
            <span>Password</span>
            <div className="login-password">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) dispatch(clearAuthError())
                }}
                required
              />
              <button
                type="button"
                className="login-reveal"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="login-submit">
            Sign in
          </button>

          <div className="login-demo">
            
           
          </div>
        </form>
      </div>
    </div>
  )
}
