import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type {
  AnchorageCollection,
  ContourCollection,
  GeofenceCollection,
  SoundingCollection,
  VesselCollection,
  VesselFeature,
  VesselProps,
} from '../../types/gis'

interface PortData {
  /** Official Fujairah Anchorage Area geometry (Notice to Mariners No. 346). */
  anchorages: AnchorageCollection | null
  /** AIS snapshot — empty until a real feed is dropped in. */
  vessels: VesselCollection | null
  /** Operator-drawn geofences, editable independently of the official areas. */
  geofences: GeofenceCollection | null
  /** Depth contours over the anchorage (npm run gen:contours). */
  contours: ContourCollection | null
  /** Spot soundings from the same run, on the same datum. */
  soundings: SoundingCollection | null
}

/** Why a spot was given up, and who decided. */
export const RELEASE_REASONS = [
  'Vessel sailed',
  'Shifted to berth',
  'Reassigned to another area',
  'Dragging anchor',
  'Weather — shamal expected',
  'Harbour Master order',
  'Spot allocated in error',
  'Other',
] as const

export interface SpotRelease {
  id: string
  vesselId: string
  vesselName: string
  /** Area the vessel was lying in when it was released. */
  areaCode: string | null
  reason: string
  note: string | null
  at: string
  by: string
}

interface PortDataState extends PortData {
  status: 'idle' | 'loading' | 'ready' | 'failed'
  error: string | null
  /**
   * Spot releases, newest first. Kept because the reason is the point: an
   * anchorage that empties with no record of why cannot be audited afterwards,
   * and "who cleared this spot and on whose order" is the first question asked
   * when a vessel turns up expecting to find one.
   */
  releases: SpotRelease[]
}

const initialState: PortDataState = {
  anchorages: null,
  vessels: null,
  geofences: null,
  contours: null,
  soundings: null,
  status: 'idle',
  error: null,
  releases: [],
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return (await res.json()) as T
}

/** Loads the static GeoJSON datasets that stand in for a backend in this PoC. */
export const loadPortData = createAsyncThunk('portData/load', async (): Promise<PortData> => {
  const base = `${import.meta.env.BASE_URL}data`
  const [anchorages, vessels, geofences, contours, soundings] = await Promise.all([
    fetchJson<AnchorageCollection>(`${base}/anchorages.json`),
    fetchJson<VesselCollection>(`${base}/vessels.json`),
    fetchJson<GeofenceCollection>(`${base}/geofences.json`),
    fetchJson<ContourCollection>(`${base}/contours.json`),
    fetchJson<SoundingCollection>(`${base}/soundings.json`),
  ])
  return { anchorages, vessels, geofences, contours, soundings }
})

const portDataSlice = createSlice({
  name: 'portData',
  initialState,
  reducers: {
    /** Adds a vessel the operator entered by hand to the waiting queue. */
    addVessel(state, action: PayloadAction<VesselFeature>) {
      if (!state.vessels) return
      state.vessels.features.push(action.payload)
    },

    /**
     * Operator-ordered status change. Speed, area and the actual times are kept
     * consistent with the new state, so the rest of the console — the schedule
     * panel especially — has something real to read rather than a bare label.
     */
    setVesselStatus(
      state,
      action: PayloadAction<{ vesselId: string; status: VesselProps['status'] }>,
    ) {
      const vessel = state.vessels?.features.find(
        (f) => f.properties.id === action.payload.vesselId,
      )
      if (!vessel) return
      const p = vessel.properties
      const now = new Date().toISOString()
      p.status = action.payload.status

      switch (action.payload.status) {
        case 'anchored':
          p.speedKn = 0
          p.ata = p.ata ?? now
          p.atd = null
          break
        case 'underway':
        case 'shifting':
          p.speedKn = 8
          break
        case 'berthing':
          // Alongside manoeuvring — dead slow, and no longer in an anchorage.
          p.speedKn = 2
          p.area = null
          break
        case 'moored':
          p.speedKn = 0
          p.ata = p.ata ?? now
          p.area = null
          p.atd = null
          break
        case 'sailed':
          p.speedKn = 10
          p.area = null
          p.atd = now
          break
        case 'awaiting':
          p.speedKn = 0
          p.area = null
          break
      }
    },

    /** Drops a vessel onto its assigned spot once it has finished moving. */
    anchorVessel(
      state,
      action: PayloadAction<{
        vesselId: string
        coordinates: [number, number]
        areaCode: string
        headingDeg?: number
      }>,
    ) {
      const vessel = state.vessels?.features.find(
        (f) => f.properties.id === action.payload.vesselId,
      )
      if (!vessel) return
      vessel.geometry.coordinates = action.payload.coordinates
      vessel.properties.status = 'anchored'
      vessel.properties.area = action.payload.areaCode
      vessel.properties.speedKn = 0
      if (action.payload.headingDeg != null) {
        vessel.properties.headingDeg = Math.round(action.payload.headingDeg)
      }
      vessel.properties.ata = new Date().toISOString()
      vessel.properties.positionAt = vessel.properties.ata
      // Where she brought up, for the drag check to measure against.
      vessel.properties.anchoredAt = [...action.payload.coordinates]
      vessel.properties.anchoredHeadingDeg = vessel.properties.headingDeg
    },

    /**
     * Revises the declared ETA and records when it was revised, so the figure
     * can be read with its own age beside it. An ETA nobody has touched since
     * the vessel was three days out is a different fact from one filed an hour
     * ago, and the page should not show them identically.
     */
    setVesselEta(state, action: PayloadAction<{ vesselId: string; eta: string | null }>) {
      const vessel = state.vessels?.features.find(
        (f) => f.properties.id === action.payload.vesselId,
      )
      if (!vessel) return
      if (action.payload.eta) vessel.properties.eta = action.payload.eta
      else delete vessel.properties.eta
      vessel.properties.etaUpdatedAt = new Date().toISOString()
    },

    /**
     * Records which sensor is holding the track.
     *
     * Operator-set here because nothing is telling the console: a live feed
     * carries it on every position report, and when one is connected this
     * reducer is what it writes through.
     */
    setVesselTrackSource(
      state,
      action: PayloadAction<{ vesselId: string; source: VesselProps['trackSource'] }>,
    ) {
      const vessel = state.vessels?.features.find(
        (f) => f.properties.id === action.payload.vesselId,
      )
      if (!vessel) return
      vessel.properties.trackSource = action.payload.source
    },

    /**
     * Moves a vessel without touching where she brought up — which is exactly
     * what dragging looks like in the data. Used by the drag watch to make the
     * alarm demonstrable on a static dataset, the same way the incident timer
     * makes a geofence breach happen rather than shipping one pre-broken.
     */
    dragVessel(
      state,
      action: PayloadAction<{ vesselId: string; coordinates: [number, number] }>,
    ) {
      const vessel = state.vessels?.features.find(
        (f) => f.properties.id === action.payload.vesselId,
      )
      if (!vessel || !vessel.properties.anchoredAt) return
      vessel.geometry.coordinates = action.payload.coordinates
      vessel.properties.positionAt = new Date().toISOString()
      // Making way over the ground while brought up is the other half of the
      // signature, so the readouts agree with the alarm.
      vessel.properties.speedKn = 0.6
    },

    /**
     * Gives up the water a vessel is lying in.
     *
     * The vessel goes back to `awaiting` rather than `sailed`: releasing a spot
     * is a decision about the anchorage, not about the call. She stops
     * occupying an area — which frees the spot for the allocator immediately —
     * and re-enters the assignment queue, so the operator can put her somewhere
     * else. Sailing is a separate status the operator sets explicitly.
     */
    releaseSpot(
      state,
      action: PayloadAction<{ vesselId: string; reason: string; note?: string }>,
    ) {
      const vessel = state.vessels?.features.find(
        (f) => f.properties.id === action.payload.vesselId,
      )
      if (!vessel) return
      const p = vessel.properties
      const at = new Date().toISOString()

      state.releases.unshift({
        id: `REL-${String(state.releases.length + 1).padStart(4, '0')}`,
        vesselId: p.id,
        vesselName: p.name,
        areaCode: p.area ?? null,
        reason: action.payload.reason,
        note: action.payload.note?.trim() || null,
        at,
        by: 'Harbour Master',
      })

      p.status = 'awaiting'
      p.area = null
      p.speedKn = 0
      // Cleared so the next anchoring stamps a fresh one — otherwise "anchored
      // for" would go on counting from a stay that has already ended, and the
      // drag check would go on measuring against a berth she has left.
      p.ata = null
      p.anchoredAt = null
      p.anchoredHeadingDeg = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadPortData.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loadPortData.fulfilled, (state, action) => {
        state.status = 'ready'
        state.anchorages = action.payload.anchorages
        // The snapshot carries no history, so every vessel already at anchor is
        // taken to have brought up exactly where she is now. That is the only
        // honest starting point: with nothing to compare against, the correct
        // answer to "is she dragging?" is no, not unknown.
        const landedAt = new Date().toISOString()
        for (const v of action.payload.vessels?.features ?? []) {
          const p = v.properties
          // Every position is as old as the moment the console received it —
          // the file carries no per-fix time of its own.
          p.positionAt ??= landedAt
          if (p.status !== 'anchored' && p.status !== 'moored') continue
          p.anchoredAt ??= [...(v.geometry.coordinates as [number, number])]
          p.anchoredHeadingDeg ??= p.headingDeg
        }
        state.vessels = action.payload.vessels
        state.geofences = action.payload.geofences
        state.contours = action.payload.contours
        state.soundings = action.payload.soundings
      })
      .addCase(loadPortData.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message ?? 'Failed to load port data'
      })
  },
})

export const {
  addVessel,
  anchorVessel,
  dragVessel,
  releaseSpot,
  setVesselEta,
  setVesselStatus,
  setVesselTrackSource,
} = portDataSlice.actions
export default portDataSlice.reducer
