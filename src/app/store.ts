import { configureStore } from '@reduxjs/toolkit'
import portDataReducer from '../features/portData/portDataSlice'
import layersReducer from '../features/layers/layersSlice'
import selectionReducer from '../features/selection/selectionSlice'
import analysisReducer from '../features/analysis/analysisSlice'
import viewReducer from '../features/view/viewSlice'
import uiReducer from '../features/ui/uiSlice'
import transitReducer from '../features/transit/transitSlice'
import authReducer from '../features/auth/authSlice'
import spotsReducer from '../features/spots/spotsSlice'
import playbackReducer from '../features/playback/playbackSlice'
import incidentsReducer from '../features/incidents/incidentsSlice'

export const store = configureStore({
  reducer: {
    portData: portDataReducer,
    layers: layersReducer,
    selection: selectionReducer,
    analysis: analysisReducer,
    view: viewReducer,
    ui: uiReducer,
    transit: transitReducer,
    auth: authReducer,
    spots: spotsReducer,
    playback: playbackReducer,
    incidents: incidentsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    // GeoJSON collections are large and immutable in practice; the deep
    // serializability/immutability scans dominate the profile without adding value.
    getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
