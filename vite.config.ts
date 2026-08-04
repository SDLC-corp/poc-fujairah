import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
  // MapLibre starts its worker with { type: 'module' }, so emit ESM workers.
  worker: { format: 'es' },
  build: {
    // MapLibre's WebGL renderer and the full Turf bundle are inherently large;
    // splitting them out keeps the app chunk small and cacheable.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl[\\/]/ },
            { name: 'turf', test: /node_modules[\\/]@turf[\\/]/ },
          ],
        },
      },
    },
  },
})
