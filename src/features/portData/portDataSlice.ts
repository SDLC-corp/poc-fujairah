import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type {
  AnchorageCollection,
  GeofenceCollection,
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
}

interface PortDataState extends PortData {
  status: 'idle' | 'loading' | 'ready' | 'failed'
  error: string | null
}

const initialState: PortDataState = {
  anchorages: null,
  vessels: null,
  geofences: null,
  status: 'idle',
  error: null,
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return (await res.json()) as T
}

/** Loads the static GeoJSON datasets that stand in for a backend in this PoC. */
export const loadPortData = createAsyncThunk('portData/load', async (): Promise<PortData> => {
  const base = `${import.meta.env.BASE_URL}data`
  const [anchorages, vessels, geofences] = await Promise.all([
    fetchJson<AnchorageCollection>(`${base}/anchorages.json`),
    fetchJson<VesselCollection>(`${base}/vessels.json`),
    fetchJson<GeofenceCollection>(`${base}/geofences.json`),
  ])
  return { anchorages, vessels, geofences }
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
        state.vessels = action.payload.vessels
        state.geofences = action.payload.geofences
      })
      .addCase(loadPortData.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message ?? 'Failed to load port data'
      })
  },
})

export const { addVessel, anchorVessel, setVesselStatus } = portDataSlice.actions
export default portDataSlice.reducer
