import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { LayerId } from '../../types/gis'

interface LayersState {
  visible: Record<LayerId, boolean>
  /** Extruded vessel hulls on a pitched camera instead of flat AIS dots. */
  vessels3d: boolean
  /** Extruded building footprints from the basemap's vector tiles. */
  buildings3d: boolean
  /** Street, place and building names from the basemap. */
  mapNames: boolean
}

const initialState: LayersState = {
  visible: {
    anchorages: true,
    // On by default. The only switch for it lives on the Settings screen, two
    // screens away from the map, so defaulting it off effectively hides it.
    contours: true,
    soundings: true,
    graticule: true,
    compass: true,
    vessels: true,
    swing: true,
    freeSpots: true,
    geofences: true,
  },
  vessels3d: true,
  buildings3d: true,
  mapNames: true,
}

const layersSlice = createSlice({
  name: 'layers',
  initialState,
  reducers: {
    toggleLayer(state, action: PayloadAction<LayerId>) {
      state.visible[action.payload] = !state.visible[action.payload]
    },
    setLayerVisible(state, action: PayloadAction<{ layer: LayerId; visible: boolean }>) {
      state.visible[action.payload.layer] = action.payload.visible
    },
    setVessels3d(state, action: PayloadAction<boolean>) {
      state.vessels3d = action.payload
    },
    setBuildings3d(state, action: PayloadAction<boolean>) {
      state.buildings3d = action.payload
    },
    setMapNames(state, action: PayloadAction<boolean>) {
      state.mapNames = action.payload
    },
  },
})

export const { toggleLayer, setLayerVisible, setVessels3d, setBuildings3d, setMapNames } =
  layersSlice.actions
export default layersSlice.reducer
