import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type {
  Incident,
  IncidentData,
  IncidentSeverity,
  IncidentStatus,
  IncidentTypeId,
} from '../../types/incident'

/**
 * The incident register: stored records, as against the conditions the console
 * detects live.
 *
 * Kept apart from `incidentsSlice`, which is a different thing wearing a
 * similar name — that one decides which *geofences* have been reported and so
 * belong on the chart. This one is the register an operator works through.
 */

export const SEVERITIES: Record<
  IncidentSeverity,
  { label: string; tone: 'alert' | 'warn' | 'low' }
> = {
  high: { label: 'High', tone: 'alert' },
  medium: { label: 'Medium', tone: 'warn' },
  low: { label: 'Low', tone: 'low' },
}

export const SEVERITY_ORDER: IncidentSeverity[] = ['high', 'medium', 'low']

export const STATUSES: Record<
  IncidentStatus,
  { label: string; tone: 'warn' | 'ok' | 'low'; hint: string }
> = {
  open: { label: 'Open', tone: 'warn', hint: 'Nobody has finished with it.' },
  resolved: {
    label: 'Resolved',
    tone: 'ok',
    hint: 'The condition cleared. The file may still be open.',
  },
  closed: { label: 'Closed', tone: 'low', hint: 'Finished with — no further action.' },
}

export const STATUS_ORDER: IncidentStatus[] = ['open', 'resolved', 'closed']

/**
 * The area an incident is filed against, written out.
 *
 * Optional, like the vessels: a slick sighted between two anchorages belongs to
 * neither, and a report that cannot be filed until somebody picks one gets a
 * wrong one picked. Empty says so rather than printing "Area" followed by
 * nothing, which reads as a bug.
 */
export const areaLabel = (area: string): string => (area ? `Area ${area}` : 'No area stated')

/** Labels for the kinds, so a filter can offer them without reading the file. */
export const INCIDENT_TYPES: Record<IncidentTypeId, string> = {
  'anchor-dragging': 'Anchor Dragging',
  'oil-spill': 'Oil Spill',
  'restricted-entry': 'Restricted Area Entry',
}

/** Pulled on demand: the register is far larger than the live snapshot. */
export const loadIncidents = createAsyncThunk(
  'incidentRegister/load',
  async (): Promise<IncidentData> => {
    const res = await fetch(`${import.meta.env.BASE_URL}data/incidents.json`)
    if (!res.ok) throw new Error(`incidents.json → HTTP ${res.status}`)
    return (await res.json()) as IncidentData
  },
)

export interface IncidentFilters {
  /** `YYYY-MM-DD`, or empty for an open end. */
  from: string
  to: string
  severity: IncidentSeverity | 'all'
  status: IncidentStatus | 'all'
  type: IncidentTypeId | 'all'
  area: string | 'all'
  /** Free text over id, vessel and description. */
  query: string
}

export const EMPTY_FILTERS: IncidentFilters = {
  from: '',
  to: '',
  severity: 'all',
  status: 'all',
  type: 'all',
  area: 'all',
  query: '',
}

interface RegisterState {
  incidents: Incident[]
  status: 'idle' | 'loading' | 'ready' | 'failed'
  error: string | null
  /**
   * What the filter panel has been *set* to, and what is actually in force.
   *
   * Two copies, because the panel has an Apply button. Editing a field changes
   * the draft; Apply promotes it. Without the split the table would re-filter
   * on every keystroke and the button would be decoration — and on a register
   * this is the wrong behaviour anyway: an operator setting four facets wants
   * to set them all and then look, not watch the list thrash between each one.
   */
  draft: IncidentFilters
  applied: IncidentFilters
  /** Which record the details page is showing. */
  selectedId: string | null
  page: number
  pageSize: number
  /**
   * The next incident number to issue. Monotonic — see `raiseIncident`.
   *
   * Seeded past the loaded register rather than at 1, so a raised incident never
   * collides with one that came out of the file.
   */
  nextSeq: number
}

const initialState: RegisterState = {
  incidents: [],
  status: 'idle',
  error: null,
  draft: EMPTY_FILTERS,
  applied: EMPTY_FILTERS,
  selectedId: null,
  page: 1,
  pageSize: 10,
  nextSeq: 1,
}

const registerSlice = createSlice({
  name: 'incidentRegister',
  initialState,
  reducers: {
    /** Edit the panel without acting on it. */
    setFilterDraft(state, action: PayloadAction<Partial<IncidentFilters>>) {
      state.draft = { ...state.draft, ...action.payload }
    },
    /** Promote the draft. Back to page one: page 4 of a new result set is nothing. */
    applyFilters(state) {
      state.applied = state.draft
      state.page = 1
    },
    resetFilters(state) {
      state.draft = EMPTY_FILTERS
      state.applied = EMPTY_FILTERS
      state.page = 1
    },
    /**
     * The search box is not part of the Apply cycle.
     *
     * Typing a vessel name is a different gesture from setting four facets: it
     * is exploratory, the operator is watching the list as they type, and
     * making them press Apply for it would feel broken. So it writes to both.
     */
    setQuery(state, action: PayloadAction<string>) {
      state.draft.query = action.payload
      state.applied = { ...state.applied, query: action.payload }
      state.page = 1
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = Math.max(1, action.payload)
    },
    setPageSize(state, action: PayloadAction<number>) {
      state.pageSize = action.payload
      state.page = 1
    },
    selectIncident(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload
    },

    /**
     * Move an incident's status, recording who did it.
     *
     * The event goes on the timeline in the same action rather than being left
     * to the caller: a status that changed with nothing on the timeline to say
     * so is a record that has lost the only part anyone would audit.
     */
    setIncidentStatus(
      state,
      action: PayloadAction<{ id: string; status: IncidentStatus; by: string; note?: string }>,
    ) {
      const inc = state.incidents.find((i) => i.id === action.payload.id)
      if (!inc || inc.status === action.payload.status) return
      inc.status = action.payload.status
      inc.timeline.push({
        at: new Date().toISOString(),
        by: action.payload.by,
        event: STATUSES[action.payload.status].label,
        note: action.payload.note ?? `Status moved to ${STATUSES[action.payload.status].label}.`,
      })
    },

    /**
     * Raise a new incident from the watch.
     *
     * The number comes from `nextSeq`, a counter that only ever goes up, and not
     * from the highest id in the register. Those look equivalent and are not:
     * derived from the register, removing the newest row hands its number
     * straight back out, and an incident number that has been quoted over the
     * radio must never mean two different things. A gap in the sequence is the
     * cheaper mistake.
     *
     * The counter is per session, seeded when the register loads. In service the
     * id would come from the back end, which is the only place it can be issued
     * safely once more than one console can raise one.
     *
     * Status, reporter and the first timeline entry are set here rather than
     * being passed in — a raised incident is open by definition, was reported by
     * whoever raised it, and its own creation is the first thing that happened
     * to it.
     */
    raiseIncident(
      state,
      action: PayloadAction<Omit<Incident, 'id' | 'status' | 'reportedBy' | 'timeline' | 'notes'> & {
        by: string
        note?: string
      }>,
    ) {
      const { by, note, ...rest } = action.payload
      const year = new Date(rest.occurredAt).getUTCFullYear()
      const seq = state.nextSeq
      state.nextSeq += 1
      const at = new Date().toISOString()

      state.incidents.unshift({
        ...rest,
        id: `INC-${year}-${String(seq).padStart(5, '0')}`,
        status: 'open',
        reportedBy: by,
        timeline: [
          {
            at,
            by,
            event: 'Raised',
            note: note?.trim() || 'Reported from the watch.',
          },
        ],
        notes: note?.trim() ? [{ at, by, text: note.trim() }] : [],
      })
    },

    addIncidentNote(
      state,
      action: PayloadAction<{ id: string; by: string; text: string }>,
    ) {
      const inc = state.incidents.find((i) => i.id === action.payload.id)
      if (!inc || !action.payload.text.trim()) return
      inc.notes.unshift({
        at: new Date().toISOString(),
        by: action.payload.by,
        text: action.payload.text.trim(),
      })
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadIncidents.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loadIncidents.fulfilled, (state, action) => {
        state.status = 'ready'
        state.incidents = action.payload.incidents
        // Seed the counter past everything the file holds. `Math.max` against
        // the current value so a reload cannot pull it back below a number this
        // session has already issued.
        const highest = action.payload.incidents.reduce((max, i) => {
          const n = Number(i.id.split('-').at(-1))
          return Number.isFinite(n) ? Math.max(max, n) : max
        }, 0)
        state.nextSeq = Math.max(state.nextSeq, highest + 1)
      })
      .addCase(loadIncidents.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message ?? 'Failed to load the incident register'
      })
  },
})

export const {
  raiseIncident,
  setFilterDraft,
  applyFilters,
  resetFilters,
  setQuery,
  setPage,
  setPageSize,
  selectIncident,
  setIncidentStatus,
  addIncidentNote,
} = registerSlice.actions
export default registerSlice.reducer
