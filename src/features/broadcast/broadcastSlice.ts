import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

/**
 * How urgently the broadcast is to be read, in the words the service uses.
 *
 * Three, not four. `MAYDAY` is missing on purpose: a distress call is made *by*
 * a vessel in grave danger, not sent out to everyone by a port authority, and
 * offering it here would invite an operator to misuse the one signal that must
 * never be doubted.
 */
export type BroadcastPriority = 'routine' | 'safety' | 'urgency'

export const PRIORITIES: Record<
  BroadcastPriority,
  { label: string; prefix: string | null; tone: 'ok' | 'warn' | 'alert'; hint: string }
> = {
  routine: {
    label: 'Routine',
    prefix: null,
    tone: 'ok',
    hint: 'Port working information — berth availability, pilot timings, notices.',
  },
  safety: {
    label: 'Safety',
    prefix: 'SÉCURITÉ',
    tone: 'warn',
    hint: 'A navigational or meteorological warning. Read out three times before the message.',
  },
  urgency: {
    label: 'Urgency',
    prefix: 'PAN PAN',
    tone: 'alert',
    hint: 'A very urgent message about the safety of a vessel or a person. Nothing short of distress.',
  },
}

export const PRIORITY_ORDER: BroadcastPriority[] = ['routine', 'safety', 'urgency']

/**
 * One character over and it will not fit in a single transmission.
 *
 * AIS message 14 — the safety-related broadcast a VTMIS actually sends — carries
 * 161 six-bit characters. Past that the text has to go out as two messages, and
 * a bridge reading the first half of a warning is worse served than one reading
 * a shorter whole, so the limit is enforced here rather than explained later.
 */
export const BROADCAST_MAX_CHARS = 161

export interface BroadcastRecord {
  id: string
  priority: BroadcastPriority
  /** Area code the broadcast was addressed to, or null for every vessel. */
  area: string | null
  text: string
  /** How many vessels were listening when it went out. */
  recipients: number
  at: string
  /** Who sent it, for the log — a broadcast is an act, not a setting. */
  by: string
}

interface BroadcastState {
  /** Newest first. Capped: this is a recent-activity list, not an archive. */
  log: BroadcastRecord[]
}

const initialState: BroadcastState = { log: [] }

const LOG_LIMIT = 20

const broadcastSlice = createSlice({
  name: 'broadcast',
  initialState,
  reducers: {
    sendBroadcast(state, action: PayloadAction<Omit<BroadcastRecord, 'id' | 'at'>>) {
      state.log.unshift({
        ...action.payload,
        id: `BC-${String(state.log.length + 1).padStart(4, '0')}`,
        at: new Date().toISOString(),
      })
      if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT
    },
  },
})

export const { sendBroadcast } = broadcastSlice.actions
export default broadcastSlice.reducer
