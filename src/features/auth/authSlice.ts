import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

/**
 * Demo gate for the proof of concept — NOT authentication.
 *
 * These credentials are compiled into the client bundle and readable by anyone
 * who opens devtools. They exist so a walkthrough starts on a login screen, not
 * to protect anything. Replace with a real backend session (httpOnly cookie or
 * short-lived token issued by the API) before any non-sample data sits behind it.
 */
export const DEMO_EMAIL = 'operator@fujairahport.ae'
export const DEMO_PASSWORD = 'fujairah@FAAMP26'

const SESSION_KEY = 'fujairah.poc.session'

export interface AuthUser {
  email: string
  name: string
  role: string
}

interface AuthState {
  user: AuthUser | null
  error: string | null
}

/** Survive a page refresh mid-demo. sessionStorage clears when the tab closes. */
function readStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
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
      const { password } = action.payload

      if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
        state.user = null
        state.error = 'Incorrect email or password.'
        return
      }

      const user: AuthUser = {
        email: DEMO_EMAIL,
        name: 'Operations Console',
        role: 'Harbour master',
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
