import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { AppDispatch, RootState } from '../../app/store'

/**
 * Demo gate for the proof of concept — NOT authentication.
 *
 * Credentials are checked against the account list in the users slice, which is
 * compiled into the client bundle and readable by anyone who opens devtools.
 * They exist so a walkthrough starts on a login screen, not to protect
 * anything. Replace with a real backend session (httpOnly cookie or short-lived
 * token issued by the API) before any non-sample data sits behind it.
 *
 * The same caveat applies to what the roles do here: the nav rail hides screens
 * a role cannot reach, which is a *usability* measure, not a security boundary.
 * Nothing stops a determined visitor from dispatching `setTab` in devtools.
 * Real enforcement belongs on the API, checking the session's role on every
 * request — the client can only decide what to *offer*.
 */

const SESSION_KEY = 'fujairah.poc.session'

export interface AuthUser {
  email: string
  name: string
  /** The role carried at sign-in. The live value is resolved from the account. */
  roleId: string
}

interface AuthState {
  user: AuthUser | null
  error: string | null
}

/** Survive a page refresh mid-demo. sessionStorage clears when the tab closes. */
function readStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as Partial<AuthUser>
    // A session written before roles existed has no roleId and would sign the
    // visitor in with no permissions at all; treat it as signed out.
    return stored.email && stored.roleId ? (stored as AuthUser) : null
  } catch {
    return null
  }
}

const initialState: AuthState = { user: readStoredUser(), error: null }

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signInSucceeded(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload
      state.error = null
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(action.payload))
      } catch {
        // Private-browsing quota errors are not worth failing the sign-in over.
      }
    },
    signInFailed(state, action: PayloadAction<string>) {
      state.user = null
      state.error = action.payload
    },
    signOut(state) {
      state.user = null
      state.error = null
      try {
        sessionStorage.removeItem(SESSION_KEY)
      } catch {
        // ignore
      }
    },
    clearAuthError(state) {
      state.error = null
    },
  },
})

export const { signInSucceeded, signInFailed, signOut, clearAuthError } = authSlice.actions

/**
 * Match the credentials against the managed accounts.
 *
 * A thunk rather than a reducer because the accounts live in their own slice —
 * which is the point: a user added on the Users screen can sign in straight
 * away, and one deactivated there stops being able to.
 */
export const signIn =
  (credentials: { email: string; password: string }) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const email = credentials.email.trim().toLowerCase()
    const account = getState().users.users.find((u) => u.email.toLowerCase() === email)

    if (!account || account.password !== credentials.password) {
      // Deliberately the same message for an unknown address and a wrong
      // password: saying which one was wrong tells an outsider which addresses
      // are real.
      dispatch(signInFailed('Incorrect email or password.'))
      return
    }

    if (!account.active) {
      dispatch(signInFailed('This account has been deactivated. Contact an administrator.'))
      return
    }

    dispatch(
      signInSucceeded({ email: account.email, name: account.name, roleId: account.roleId }),
    )
  }

export default authSlice.reducer
