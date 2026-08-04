import { config } from 'maplibre-gl'
// MapLibre GL v6 resolves its worker with `new URL('./maplibre-gl-worker.mjs',
// import.meta.url)` at runtime, so no bundler can statically emit that chunk —
// the request 404s and every GeoJSON source silently stalls at "not loaded".
// `?worker&url` makes Vite bundle the worker (with its shared dependency) and
// hand back a real URL, which we point MapLibre at before any map is created.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

config.WORKER_URL = workerUrl
