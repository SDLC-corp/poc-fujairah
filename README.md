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

## Charts

Two charts on the dashboard, chosen by what the data has to do rather than by looks:

- **Occupancy through the day** — a trend over time for a single series, so an *area*: a smooth
  swell from a zero baseline (an area encodes magnitude, so the axis cannot be truncated). Measured
  hours are a solid line over a wash; the forecast is dashed and hatched, so the two halves differ
  by shape and not by fill alone. The level it draws is live utilisation, shared with the Occupancy
  screen through `buildOccupancySeries` so the two can never disagree.
- **Fleet by class** — a donut, which reads part-to-whole only at a glance: the 14 AIS types are
  therefore rolled into four buckets, each direct-labelled with its count and share. Its palette
  (`#1d4ed8, #06b6d4, #a855f7, #c2410c`) was run through the design system's validator and passes
  the lightness, chroma, CVD-separation, normal-vision and contrast checks — the map's FAA chart
  colours fail as a categorical encoding, which is why they are not reused here.

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
  hard-coded. The suggestion is labelled **AI suggestion**, and an operator can override it from a
  **Manual override** picker offering the nearest big-enough spot in *every* area — including ones
  the notice does not designate for that vessel, which are marked as such and carry a warning on
  the card. The payload records `decidedBy: "engine" | "operator"`. A vessel that is not in the AIS
  feed can be **entered by hand** (name, type, LOA, flag, ETA); beam and draft are derived from the
  length, it is placed in the waiting area east of the anchorage, and it joins the same queue and is
  matched the same way. Confirming an assignment **walks the vessel to its spot** on the map: the camera
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
  contours.json         10 m depth contours, GEBCO-derived (npm run gen:contours)
  soundings.json        spot soundings from the same run, same datum
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
  map/                  basemap style, source/layer definitions, 3D hull builder,
                        compass rose geometry
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

### Depth contours

[public/data/contours.json](public/data/contours.json) carries 10 m isobaths from 10 m to 200 m
over the anchorage and its approaches, generated by `npm run gen:contours`. The lines draw
**between the area fills and their outlines** — over the tints, since the FAA fills carry real
weight at 0.5 opacity and would bury a line beneath them, but under the boundaries, the free spots
and the vessels, which are what the map is actually about. Their **labels** are added last of all:
MapLibre places symbols in style order, so an early label layer wins every collision, and putting
depths first buried the area codes and vessel names. Placed at the end they are the first thing
dropped when the map gets crowded, which is the right priority for a depth reading.

**Every isobath is drawn at one weight and one colour.** The usual convention thickens each 50 m
line as an index to count from, and that was how this started — but the FAA sits in 65–145 m, so
only the 100 m and 150 m lines ever cross the water the operator works in. Two heavy lines out of
twenty bought no counting and cost a visible hierarchy between depths that do not differ in
importance. `major` is still carried on each feature, and still decides which lines name themselves
first: twenty labelled contours at once is unreadable, so the 50s label from z11.5 and the 10 m
lines join them at z12.5 — density, not rank. The toggle sits at the foot of **Settings → Layers**.

**Why they are generated rather than fetched.** MapTiler Ocean ships a ready-made `contour_line`
layer, and reading it straight off the `ocean` tileset is a dozen lines of style. But its tilejson
lists every depth it carries, and between −50 m and −100 m there is nothing: the levels are −25,
−50, −100, −200, −250, −500, −750… The FAA lies in 65–145 m, so the whole anchorage would be
crossed by the single 100 m line. (MapTiler's own Ocean style reads that same `tiles/ocean` source;
there is no finer `ocean-v4`, and `tiles/contours` is land relief, not bathymetry.) Contouring
[GEBCO](https://www.gebco.net/) ourselves gives the 10 m interval the published chart uses at this
scale, and keeps the app's static-JSON, no-backend shape.

**Datum.** GEBCO is referenced to mean sea level; the chart sounds to Fujairah Harbour Datum. From
the port's published tidal levels MSL stands 1.7 m above that datum and LAT −0.1 m, so **charted
depth = |GEBCO| − 1.8 m**. The generator applies that shift, so every figure on the map reads the
way the chart prints it. Mixing an unshifted global bathymetry source back in would read 1.8 m
deeper than the chart — hence `depthM` is stored as a positive depth below chart datum and
the datum is recorded in the file's `metadata`.


**Accuracy.** Spot-checked against the soundings printed on the FAA sheet: GEBCO reads 94 m where
the chart prints 92–98, 141 m against 133–141, 114 m against 110–118. Every area's contour span
falls inside its charted sounding range. The seabed here is a smooth N–S shelf slope, which is the
shape a ~450 m grid reproduces well.

**Not the harbour.** The dredged basin is narrower than one GEBCO cell, so the generator stops
short of contouring it — an interpolated surface would round the engineered dredge edges into a
gentle bowl exactly where a berthing decision gets made. The chart states those depths as dredged
*areas* (15.0 m 2019, 18.0 m 2010) and that is how they should be carried. Real per-berth soundings
have to come from the port's hydrographic survey.

### Spot soundings

The same run writes [public/data/soundings.json](public/data/soundings.json) — 363 depth figures
scattered over the water, which is what actually makes the map read as a chart rather than as a
street map with lines drawn on it. They come off the GEBCO grid already in the cache, so they cost
no extra API calls, and they carry the same datum shift as the contours.

**Density is not solved by zoom gates.** Soundings are posted in two tiers — every 8th grid node
(3.6 km) and every 4th (1.8 km) — and the tier is written onto each feature as `symbol-sort-key`.
The 1.8 km posting is denser than the map can show zoomed out, so rather than filtering by zoom,
`soundings-label` simply lets them collide: MapLibre drops what does not fit, the coarse tier wins
placement and holds the water at low zoom, and the finer one fills in as the map opens up. That is
the same thinning a chart does by hand, for free and at every scale. The layer sits last among the
symbols, so a sounding is dropped before an area code or a ship's name is.

**Two knobs, and they do different things.** `SOUNDING_TIERS` in the generator decides how many
soundings are *available* to place; `text-padding` on the layer decides how much room each one
reserves, and so how many actually land. Reach for the padding first — it thins the field at every
zoom without regenerating anything. A third tier at every 2nd node (0.9 km) was tried and dropped:
it was 1068 of 1431 soundings and buried the water.

**They are not charted soundings.** A charted sounding is the *shoalest* depth found over a patch,
measured. These are interpolated from a ~450 m grid — they describe the shape of the seabed, not
its least depth, and they stop at the 10 m contour because this grid cannot resolve shoal water and
a wrong figure there is worse than none. `Not for navigation` applies to them more sharply than to
anything else on the map.

### Graticule

[graticule.ts](src/map/graticule.ts) draws meridians and parallels every 5′, graduated at 1′ and
subdivided at 0.2′ — the border scale off the sheet, run across the map. Like the rose it is
geometry rather than data: the coordinate system fixes it, so it is built once and never fetched.

**What it is for, and the trap in it.** The graduation is how a position is read off the chart or
plotted onto it. But the latitude scale is also the *distance* scale, and that is the part worth
keeping straight: one minute of latitude is one nautical mile by definition, everywhere, so a
distance is spanned against the **parallels**. One minute of longitude is not — at Fujairah's
25.2°N it is 0.905 NM, and measuring against the meridians under-reads by about a tenth. The map
carries a nautical scale bar beside the metric one for the same reason: swing circles and safety
margins are worked in metres here, but a passage distance is read in miles.

**Ticks are sized in minutes, not pixels.** That looks like the mistake the compass rose made — a
screen ornament pinned to the ground — but it is the opposite. The graduation the ticks sit on is
*also* in minutes, so tick and spacing scale together and the ruler holds its proportion at every
zoom, with nothing to recompute on a move. The one correction needed is on the meridians: their
ticks run east–west, and a degree of longitude is shorter than a degree of latitude, so the tick
length is divided by cos(lat) or the meridians carry visibly stubbier graduations than the
parallels.

### Compass rose

[compassRose.ts](src/map/compassRose.ts) builds a chart rose as geometry rather than fetching one,
laid out as the sheet lays it out: one ring graduated every degree — a comb of hairlines, broken
into hands at five and carrying the numbers at ten — numbered 000 to 350 outside the ring, an open
leaf standing at true north, the magnetic north the compass would actually show dashed beside it,
and the variation written up a dotted meridian. Thin black lines on the chart, no panel behind
them. [CompassRose.tsx](src/components/CompassRose.tsx) draws it.

The size is set by the graduation, not by taste: 36 three-digit numbers share a circumference of
2π·1.08·R, and below R=76 they start to touch. The graduation is drawn as three `<path>` elements,
one per tier, rather than 360 `<line>`s — the ring is re-rendered on every frame the map is turned,
and one node reconciles where 360 do not.

**Variation** is the only external input, and it comes from the **World Magnetic Model** rather
than from the chart, so it does not go stale: WMM-2025 gives 2.131° E at 25°14′N 056°32′E drifting
+0.0052° a year, and the annual term carries that forward from the epoch — 2°08′E today. Model
uncertainty is ±0.30°, so the rose is drawn to the minute and no finer.

**Position.** The rose is SVG pinned to the top right of the map pane, not a map layer. It was map
layers first, laid on the water plane in real metres, and that is wrong three ways over: a rose
sized in metres is only right at one zoom, it leaves the pane at every other — at the opening view
it sat 529 px east of centre, past the right edge of a pane the side panels had already cut to
~430 px of half-width — and under the 55° pitch a circle on the water projects to a squashed
ellipse. A rose is an instrument in the corner of the sheet, so it is drawn in the corner of the
pane and the only thing it takes from the map is the bearing, turned back out of it so 000 points
at true north however the camera is swung. `ROSE_RADIUS` sizes it — 213 px, given up to `26vh` on a
short pane — and the layer switch still works, read straight from the store instead of through a
style layer.

One thing to keep straight: AIS `headingDeg` is **true**, so the vessels and the ring agree, and
the dashed magnetic north is there for reading a compass bearing, not for interpreting the fleet.

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

### Packing an area full — WALLPACK_MHDF

`npm run gen:wallpack` repacks one area (**BN** by default; pass a code as the third argument) with
[gen-wallpack.mjs](scripts/gen-wallpack.mjs), leaving every other area exactly as `gen:vessels`
produced it. `npm run gen:vessels` puts it back.

This is the algorithm from Huang, Hsu & He (2010), *Assessing Capacity and Improving Utilization of
Anchorages*, Figure 9. A **corner placement** is a position where the arriving disc touches two
items — an edge of the anchorage or an already-placed disc — and its **hole degree** is
`1 − dmin/r`, the gap to the nearest item it is *not* touching, scaled by its own radius. A disc
wedged into a hole scores near 1; one lying against a single neighbour in open water scores near 0.
The order is: take a two-side corner if one exists, else the vessel-side corner with the largest
hole degree, else the two-vessel corner with the largest hole degree, else the anchorage is full.
Sizes are packed largest-first, which is WALLPACK's own heuristic — put the big discs in the
corners while the corners are still empty.

**The fill grows in from the borders**, and that falls out of the algorithm rather than being
imposed: with no vessels placed yet the only items to touch are the anchorage's own edges, so the
first placements can only be corners, then wall positions, and only once there is a wall of ships
do two-vessel holes appear.

Packing **BN (31.7 km²)** places **58 vessels from 54 m to 366 m LOA at 74 % swing utilisation**,
and `npm run verify` confirms **no swing circle overlaps another and none leaves the area**. Every
vessel lies on the same heading with a few degrees of yaw, because they share one wind and one
tide, which is also why the packed area reads as rows of parallel needles rather than a scatter.

**Two spots are held open**, and they have to be held deliberately. `selectFreeSpots` lays a hexagonal
grid whose pitch is set by the *largest* vessel the area holds — 366 m here — so an offer needs a
**742 m radius** circle clear of every anchor and centred on a grid point. A hole that big and that
precisely placed does not fall out of a dense packing by luck. `RESERVE_SPOTS` therefore mirrors
that selector's grid exactly (same pitch, same hexagonal offset, same origin), takes the grid
points **nearest the middle of the area** whose circles fit wholly inside it, and packs around them
as obstacles. The discs are dropped from the fleet afterwards, and the app rediscovers them as
offers — BN reports **2 free spots** rather than being unassignable. Because that grid is centred
on the area's bounding box, the first lands on BN's centroid exactly and the second 1.5 km out,
both with the packing closed around them.

Raising `RESERVE_SPOTS` is how you empty a berth: each reserved disc displaces the vessels the
packer would otherwise have put there, so going from one spot to two dropped the fleet from 60 to
58 and utilisation from 79 % to 74 %. A central hole is expensive — it blocks placements in every
direction, where one against a wall only blocks inward.

**Two margins, and they exist for numerical reasons rather than nautical ones.** The packing runs
on a local equirectangular plane about the area's centroid — circle geometry in degrees is
meaningless, since a degree of longitude is shorter than a degree of latitude — while
`verify-data.mjs` checks containment with `booleanWithin` on a 64-gon in degree space and clearance
with geodesic distance. Two different approximations, so a disc laid *exactly* tangent lands on
either side of the line at random. `EPS_M` (5 m) backs every placement off its neighbours and
`EDGE_EPS_M` (10 m) off the boundary. Both are noise against a 118 m radius; without them the
verifier reports fouled pairs that are, in the arithmetic, exactly clear. The plane also uses the
WGS-84 degree lengths rather than the spherical shorthand, which removes about 1.5 m of systematic
error across a swing circle on its own.

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

Attribution: © MapTiler · © OpenStreetMap contributors · depth contours derived from GEBCO. The
anchorage geometry is transcribed
from the published notice for demonstration purposes — **not for navigation**; always work from
the current official chart and notices.
