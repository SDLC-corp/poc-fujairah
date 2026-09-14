import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

/**
 * Console accounts — who can sign in, and which role each one carries.
 *
 * The password sits here in plain text because this is a demo gate compiled
 * into the client bundle, not authentication; the note at the top of authSlice
 * applies in full. A real deployment keeps a hash on the server, issues a
 * session, and never ships either to the browser. Nothing on this screen should
 * be read as a security boundary — it is the *shape* of user administration,
 * so the workflow can be reviewed before there is a backend to enforce it.
 */

/** What a new account is given until its holder changes it. */
export const DEFAULT_PASSWORD = 'fujairah@FAAMP26'

/** Below this the Add User dialog refuses to submit. */
export const MIN_PASSWORD_LENGTH = 8

export interface User {
  id: string
  name: string
  email: string
  password: string
  /** The role this account carries; the whole rail follows from it. */
  roleId: string
  /**
   * Deactivated accounts keep their role and their history but cannot sign in.
   * Users are never deleted — an account that signed off on an anchorage
   * assignment has to stay resolvable when that assignment is audited later.
   */
  active: boolean
  createdAt: string
  updatedAt: string
}

/**
 * One curated sign-in per role, offered on the login screen so a walkthrough
 * can show what each role actually sees. They are seeded into the account list
 * below rather than living beside it, so there is one source of truth for who
 * exists.
 */
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

/**
 * How many accounts each role holds once seeded. The Roles screen reads its
 * headcount off the accounts themselves, so this is the only place the number
 * is decided — a role with eight operators has eight rows to show for it.
 */
const HEADCOUNT: { roleId: string; count: number }[] = [
  { roleId: 'super-admin', count: 3 },
  { roleId: 'admin', count: 3 },
  { roleId: 'harbour-master', count: 3 },
  { roleId: 'deputy-harbour-master', count: 5 },
  { roleId: 'port-control-operator', count: 8 },
  { roleId: 'anchorage-officer', count: 6 },
  { roleId: 'tug-operator', count: 4 },
  { roleId: 'vts-operator', count: 7 },
  { roleId: 'external-stakeholder', count: 2 },
]

/** Staff filling out the headcount behind each curated sign-in. */
const STAFF = [
  'H. Al Zaabi',
  'D. Kowalski',
  'R. Osei',
  'P. Nair',
  'F. Al Suwaidi',
  'G. Oliveira',
  'N. Haddad',
  'Y. Tanaka',
  'B. Castillo',
  'Z. Al Nuaimi',
  'E. Mwangi',
  'C. Lombardi',
  'V. Subramanian',
  'O. Adeyemi',
  'I. Petrova',
  'A. Al Shamsi',
  'M. Rizvi',
  'J. Fernandes',
  'W. Chen',
  'S. Bakker',
  'T. Okafor',
  'L. Kaur',
  'Q. Hassan',
  'U. Erdogan',
  'K. Sorensen',
  'R. Mendoza',
  'D. Al Ketbi',
  'N. Costa',
  'G. Reyes',
  'A. Yilmaz',
  'H. Mutlu',
]

/** Two accounts start deactivated, so the list shows both states from the off. */
const SEEDED_INACTIVE = new Set(['y.tanaka@fujairahport.ae', 'g.reyes@fujairahport.ae'])

/** "H. Al Zaabi" -> "h.alzaabi@fujairahport.ae". */
function emailFor(name: string): string {
  const [first, ...rest] = name.split(' ')
  const surname = rest.join('').toLowerCase().replace(/[^a-z]/g, '')
  return `${first[0].toLowerCase()}.${surname}@fujairahport.ae`
}

/**
 * Spread over the fortnight the console was set up in, so the Created column
 * is a history rather than forty identical timestamps.
 */
const SEED_EPOCH = Date.parse('2024-05-10T08:00:00Z')

function seedUsers(): User[] {
  const out: User[] = []
  let staff = 0

  for (const { roleId, count } of HEADCOUNT) {
    const curated = DEMO_ACCOUNTS.filter((a) => a.roleId === roleId)
    const holders = [
      ...curated.map((a) => ({ name: a.name, email: a.email })),
      ...Array.from({ length: Math.max(0, count - curated.length) }, () => {
        const name = STAFF[staff++ % STAFF.length]
        return { name, email: emailFor(name) }
      }),
    ]

    for (const holder of holders) {
      const n = out.length + 1
      const at = new Date(SEED_EPOCH + n * 7_200_000).toISOString()
      out.push({
        id: `U-${String(n).padStart(4, '0')}`,
        name: holder.name,
        email: holder.email,
        password: DEFAULT_PASSWORD,
        roleId,
        active: !SEEDED_INACTIVE.has(holder.email),
        createdAt: at,
        updatedAt: at,
      })
    }
  }

  return out
}

interface UsersState {
  users: User[]
}

const initialState: UsersState = { users: seedUsers() }

export type NewUser = Omit<User, 'id' | 'createdAt' | 'updatedAt'>
export type UserEdits = Partial<NewUser>

/** Case-insensitive, since an email address is not case-sensitive in practice. */
export function emailTaken(users: User[], email: string, exceptId?: string): boolean {
  const wanted = email.trim().toLowerCase()
  return users.some((u) => u.id !== exceptId && u.email.toLowerCase() === wanted)
}

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    addUser(state, action: PayloadAction<NewUser>) {
      const email = action.payload.email.trim().toLowerCase()
      // The dialog blocks this, but a duplicate address would quietly shadow an
      // existing account at sign-in, so it is refused here too.
      if (emailTaken(state.users, email)) return

      const now = new Date().toISOString()
      state.users.push({
        ...action.payload,
        name: action.payload.name.trim(),
        email,
        id: `U-${String(state.users.length + 1).padStart(4, '0')}`,
        createdAt: now,
        updatedAt: now,
      })
    },

    updateUser(state, action: PayloadAction<{ id: string; changes: UserEdits }>) {
      const user = state.users.find((u) => u.id === action.payload.id)
      if (!user) return

      const { changes } = action.payload
      if (changes.email !== undefined) {
        const email = changes.email.trim().toLowerCase()
        if (emailTaken(state.users, email, user.id)) return
        user.email = email
      }
      if (changes.name !== undefined) user.name = changes.name.trim()
      if (changes.password !== undefined) user.password = changes.password
      if (changes.roleId !== undefined) user.roleId = changes.roleId
      if (changes.active !== undefined) user.active = changes.active

      user.updatedAt = new Date().toISOString()
    },

    setUserActive(state, action: PayloadAction<{ id: string; active: boolean }>) {
      const user = state.users.find((u) => u.id === action.payload.id)
      if (!user || user.active === action.payload.active) return
      user.active = action.payload.active
      user.updatedAt = new Date().toISOString()
    },
  },
})

export const { addUser, updateUser, setUserActive } = usersSlice.actions
export default usersSlice.reducer
