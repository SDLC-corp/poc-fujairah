# Port of Fujairah — GIS Proof of Concept

Browser-only GIS PoC for offshore anchorage operations at the Port of Fujairah. The map carries
the **official Fujairah Anchorage Area** geometry; vessels come from an AIS feed you supply.
Geographic analysis is computed live in the browser.

## Stack

| Piece | Why |
| --- | --- |
| **React + TypeScript** | Modern, type-safe frontend. |
| **Vite** | Fast startup and hot reload for development. |
| **Redux Toolkit + React-Redux** | Single predictable store for map state, selection and analysis parameters. |
| **MapLibre GL JS** | Interactive GIS map with no vendor lock-in, on a MapTiler Streets vector basemap. |
| **Turf.js** | Point-in-polygon, distance, buffer and overlap calculations directly in the browser. |
| **Static JSON** | Keeps the PoC simple — no backend or database required. |

## Interface

Navy-on-white theme, with all tokens in [index.css](src/index.css) — restyle by editing the
`:root` block, nothing else hard-codes a colour.

An icon rail on the left switches between screens (Dashboard, Vessel tracking, Occupancy,
Assignment, Vessel details, Reports, Settings, Help); the selected screen owns the full width and
its panels flow into as many columns as fit. Every screen except Assignment is data-only and ships
the raw JSON payload it would consume. **The map appears on Dashboard and Anchorage Assignment** —
the two screens about where vessels physically are — split beside their panels. It opens framed on
the whole anchorage; the **Port** extent preset jumps to the quay. A **Legend** on the map keys
every area code and vessel colour.

## 3D

- **Vessels** — each AIS point is turned into two extruded polygons (hull + deckhouse) built
  with Turf's `destination` from the vessel's position, heading, length and beam, so ships sit at
  true scale and point the right way. Heights are exaggerated ×1.5
  ([vesselGeometry.ts](src/map/vesselGeometry.ts)) — a real 25 m superstructure is only a few
  pixels at anchorage zoom and reads as flat, but the hulls stay small inside their swing circles.
- **Buildings** — the Streets style already carries a `fill-extrusion` building layer; the app
  finds it, pulls its minzoom down to port-overview zoom and retones it rather than duplicating
  the geometry.
- **Camera** — MapLibre only rotates and tilts on right-click or ctrl+drag, which is not
  discoverable, so tilt and rotation are also exposed as sliders. Map gestures write back to the
  store on `pitchend`/`rotateend`, so the sliders and the map never disagree.
- **Street & building names** — road, place and POI labels come from the basemap and are
  toggleable. POI labels are pulled forward from z15/16 to z14, and every name field is rewritten
  to `name:en → name:latin → name`, since around Fujairah many features carry only an Arabic
  `name`. How many names appear is a function of zoom: the vector tiles only start carrying minor
  roads and POIs around z14–16.

## Getting started

The MapTiler basemap key lives in [.env](.env) as `VITE_MAPTILER_KEY`. Client-side map keys are
visible to anyone loading the app — restrict it by origin in the MapTiler dashboard rather than
trying to hide it.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle
npm run preview  # serve the production build
npm run lint     # oxlint
npm run verify   # run the Turf analyses over the static data in Node
```

## What it demonstrates

- **Point-in-polygon** — every vessel is tested against the 14 declared polygons, so it reports
  the anchorage it is actually lying in. Vessels found inside the **Restricted Area** (submarine
  pipelines, oil terminals, SPMs — anchoring prohibited) surface as incursion alerts.
- **Distance** — great-circle distance from each vessel to the nearest of the four designated
  Area T anchor berths, drawn on the map as a labelled leader line.
- **Buffer + proximity** — an adjustable radius (0.1–3 km) around the selected vessel: other
  vessels inside it, anchor berths inside it, and how much of each declared area it covers
  (`intersect` + `area`).
- **Capacity and free spots** — a "spot" is one non-overlapping swing circle. The app lays a
  hexagonal grid over each anchorage and keeps the positions whose circle clears every vessel
  already lying there; those are drawn as dashed green circles on the map. Available/occupied on
  the dashboard are counted from exactly that geometry, so the figures and the map always agree.
- **Assignment** — five vessels sit outside the declared areas with `status: "awaiting"`. For each
  one the app filters the free spots down to areas the notice designates for that vessel type
  (LNG carriers to G/D, anything over 300 m to VN/VS, service craft to C…), drops any spot whose
  radius is smaller than the vessel's own swing radius, and ranks what is left by distance. The
  match percentage is computed from proximity and spare radius — nothing about the queue is
  hard-coded. Confirming an assignment **walks the vessel to its spot** on the map: the camera
  frames the passage, and the hull runs the **routed track** — out of the waiting position, into the
  Passage Way the notice sets aside for transit, along the corridor, then off to the spot — with the
  plan drawn faintly ahead of it and the trail solid behind. On arrival
  the store writes the new position, sets the vessel to `anchored` in that area and pops up the
  confirmation. Occupancy, free spots and the queue all recompute from that one state change.
- **Ground tackle** — an anchored vessel lies back on its cable, so the map draws the anchor
  itself, ahead of the bow at ~1.2 × LOA, with the chain running back to the ship. The anchor mark
  is a canvas-rendered icon registered with the style (MapLibre needs a raster for `icon-image`),
  and both appear from z12 so they do not clutter the anchorage-wide view.
- **Geofences** — [geofences.json](public/data/geofences.json) holds operator-drawn incident
  boundaries inside the anchorages (an oil-spill containment area, for example), separate from the
  official notice geometry and expected to be edited. They render as dotted outlines, red for an
  exclusion and amber for an advisory, and point-in-polygon reports which vessels are inside one as
  a breach on the dashboard. Set `active: false` to keep a fence on the map but stop it alerting.
- **Swing circles** — every vessel carries the water it actually needs at anchor:
  `radius = LOA x factor + safety margin` (defaults ×2 and 10 m, both editable under Settings →
  Swing radius parameters). Clicking a ship reads out its radius, diameter and safe area in
  hectares, and writes the radius on the map.
- **Selection & styling** — clicking any feature drives `feature-state`, the details card, and
  the analysis panels through Redux. Vessels are coloured by AIS category from the supplied
  palette ([vesselTypes.ts](src/map/vesselTypes.ts)); areas are labelled with their code, as on
  the published chart, with a **Legend** on the map keying every area code and vessel colour.
  Vessel names are drawn only for the selected ship — ~500 permanent labels
  would bury the map — and the swing readout sits on the north edge of its circle, clear of the
  extruded hull.

## Layout

```
public/data/
  anchorages.json       official Fujairah Anchorage Area — real, sourced (see below)
  vessels.json          sample fleet with ATA/ETD (npm run gen:vessels)
  geofences.json        operator-drawn incident fences — editable, not official
src/
  app/                  store + typed hooks (useAppDispatch / useAppSelector)
  features/
    portData/           async thunk that loads the static JSON
    layers/             layer visibility + 3D vessel/building/swing switches
    selection/          currently selected feature
    analysis/           analysis parameters, and all Turf selectors
    view/               camera tilt, rotation and extent presets
    ui/                 nav rail state + active screen
  map/                  basemap style, source/layer definitions, 3D hull builder
  components/           MapView, shared panels and screens/
  types/gis.ts          typed GeoJSON models
scripts/verify-data.mjs same Turf checks, runnable headless
```

Analysis lives in **memoised Redux selectors** (`src/features/analysis/selectors.ts`), so Turf
only recomputes when the data or the analysis parameters actually change — components stay
declarative and the map is a pure projection of store state.

## Official anchorage data

[public/data/anchorages.json](public/data/anchorages.json) is **not synthetic**. It is transcribed
from *Port of Fujairah Notice to Mariners No. 346 — Fujairah Anchorage Area (FAA) reorganisation*,
effective 01 February 2024: the 12 designated areas (A, BN, BS, C, D, G, N, S, T, VN, VS, W), the
Passage Way, the Restricted Area, the four Area T anchor berths and the eight SPM channel buoys.
The notice gives degrees + decimal minutes; those are converted to decimal degrees and every
feature keeps a `source` field naming the notice. Fill colours follow the published FAA chart, so
paired areas (BN/BS, VN/VS) share a colour.

The anchorage sits roughly 5–25 km east and north-east of the quay, so the map carries **Port** and
**Anchorage area** extent presets — the two are too far apart to pan between comfortably.

### Sample fleet

`npm run gen:vessels` regenerates [public/data/vessels.json](public/data/vessels.json), plus three
vessels transiting the Restricted Area so the incursion alert has something to report.

Vessels are laid on a **hexagonal grid pitched at twice the area's largest swing radius**, clipped
to the polygon, so **no two swing circles ever intersect**. How many fit is therefore a property of
the geometry, not a fixed number: Area BS takes 30, Area W 24, but Area G — 4.3 km² reserved for
300 m LNG carriers, each needing a 610 m radius — takes 2. The vessel mix per area follows what the
area is designated for. Deterministic, so regenerating gives the same fleet.

The pitch assumes the default factor (×2) and margin (10 m); raising either in Settings will make
circles overlap, which is the honest answer — the water simply is not there.

### Supplying vessels

Replace the sample fleet with your own Point features; `properties` must match `VesselProps` in
[src/types/gis.ts](src/types/gis.ts), where `type` is one of the 14 AIS categories:

```jsonc
{ "type": "Feature", "id": "V-001",
  "properties": { "id": "V-001", "name": "MT Example", "imo": "9431123", "type": "chemicaltanker",
                  "flag": "AE", "lengthM": 244, "beamM": 42, "draftM": 14.2,
                  "speedKn": 0, "headingDeg": 108, "status": "anchored" },
  "geometry": { "type": "Point", "coordinates": [56.52, 25.24] } }
```

`lengthM`, `beamM` and `headingDeg` drive the 3D hulls, `lengthM` also sets the swing radius,
`type` picks the colour, `status` drives the flat/3D styling, and the optional `ata`/`etd`
timestamps feed the occupancy screen's dwell times and departure ordering. Everything downstream — containment, nearest anchor berth, buffers, the dashboard
counts — recomputes automatically. Point `loadPortData` at a live endpoint to go from file to feed.

## MapLibre v6 + Vite gotchas (already handled here)

- **Worker URL.** MapLibre v6 resolves its worker with `new URL('./maplibre-gl-worker.mjs',
  import.meta.url)` at runtime, so no bundler emits that chunk: the request 404s and every
  GeoJSON source silently stalls as "not loaded" — layers exist but nothing renders, with no
  console error. [src/map/workerSetup.ts](src/map/workerSetup.ts) points `config.WORKER_URL` at a
  Vite-bundled worker (`?worker&url`), and `worker: { format: 'es' }` in the Vite config emits it
  as ESM.
- **Glyphs.** A raster style carries no `glyphs` URL, so symbol layers render no text at all —
  one reason to use a vector style, which brings its own fonts and sprites.
- **Style reloads.** `setStyle` discards custom sources and layers, and no single event reliably
  marks the moment a new style has taken over. [MapView](src/components/MapView.tsx) re-attaches
  whenever the port sources have gone missing and bumps a style epoch, so the data, visibility,
  camera and selection effects re-apply.
- **Duplicate polygon labels.** A polygon is labelled once per vector tile it touches, so an area
  the size of Anchorage Area A shows its name several times as you zoom in. Area names are
  therefore drawn from a separate point source — one Turf `pointOnFeature` anchor per feature
  (`selectLabelPoints`).

## Swapping in real data

`portDataSlice` is the only place that knows where data comes from. Point `loadPortData` at a
REST/OGC API and everything downstream — map layers, selectors, panels — is unchanged.

Attribution: © MapTiler · © OpenStreetMap contributors. The anchorage geometry is transcribed
from the published notice for demonstration purposes — **not for navigation**; always work from
the current official chart and notices.
