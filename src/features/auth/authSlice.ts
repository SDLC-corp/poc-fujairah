import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

/**
 * Demo gate for the proof of concept — NOT authentication.
 *
 * These credentials are compiled into the client bundle and readable by anyone
 * who opens devtools. They exist so a walkthrough starts on a login screen, not
 * to protect anything. Replace with a real backend session (httpOnly cookie or
 * short-lived token issued by the API) before any non-sample data sits behind it.
 *
 * The same caveat applies to what the roles do here: the nav rail hides screens
 * a role cannot reach, which is a *usability* measure, not a security boundary.
 * Nothing stops a determined visitor from dispatching `setTab` in devtools.
 * Real enforcement belongs on the API, checking the session's role on every
 * request — the client can only decide what to *offer*.
 */
export const DEMO_PASSWORD = 'fujairah@FAAMP26'

/** One sign-in per role, so a walkthrough can show what each one actually sees. */
export const DEMO_ACCOUNTS: { email: string; name: string; roleId: string }[] = [
  { email: 'superadmin@fujairahport.ae', name: 'S. Al Marzouqi', roleId: 'super-admin' },
  { email: 'admin@fujairahport.ae', name: 'John Doe', roleId: 'admin' },
  { email: 'harbourmaster@fujairahport.ae', name: 'Capt. R. Al Hammadi', roleId: 'harbour-master' },
  {
    email: 'deputy.harbourmaster@fujairahport.ae',
    name: 'Capt. M. Farouk',
    roleId: 'deputy-harbour-master',
  },
  { email: 'portcontrol@fujairahport.ae', name: 'A. Rahman', roleId: 'port-control-operator' },
  { email: 'anchorage@fujairahport.ae', name: 'S. Menon', roleId: 'anchorage-officer' },
  { email: 'tugoperator@fujairahport.ae', name: 'K. Al Blooshi', roleId: 'tug-operator' },
  { email: 'vts@fujairahport.ae', name: 'T. Nakamura', roleId: 'vts-operator' },
  { email: 'stakeholder@fujairahport.ae', name: 'L. Pereira', roleId: 'external-stakeholder' },
  // The original walkthrough account, kept so existing links and notes still
  // work. Carries Super Admin, so a demo that starts here sees the whole
  // console rather than whichever role it happened to be pinned to.
  { email: 'operator@fujairahport.ae', name: 'Operations Console', roleId: 'super-admin' },
]

/** Shown on the login screen as the default to try. */
export const DEMO_EMAIL = DEMO_ACCOUNTS[1].email

const SESSION_KEY = 'fujairah.poc.session'

export interface AuthUser {
  email: string
  name: string
  /** The role this sign-in carries; everything the console offers follows it. */
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
    signIn(state, action: PayloadAction<{ email: string; password: string }>) {
      const email = action.payload.email.trim().toLowerCase()
      const account = DEMO_ACCOUNTS.find((a) => a.email === email)

      if (!account || action.payload.password !== DEMO_PASSWORD) {
        state.user = null
        state.error = 'Incorrect email or password.'
        return
      }

      const user: AuthUser = {
        email: account.email,
        name: account.name,
        roleId: account.roleId,
      }
      state.user = user
      state.error = null
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
      } catch {
        // Private-browsing quota errors are not worth failing the sign-in over.
      }
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

export const { signIn, signOut, clearAuthError } = authSlice.actions
export default authSlice.reducer
