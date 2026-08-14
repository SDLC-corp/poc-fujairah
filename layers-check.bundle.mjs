// layers-check.tmp.mts
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";

// src/map/areaColors.ts
var AREA_COLORS = {
  A: "#ec6ba4",
  N: "#f08a4b",
  C: "#5cb85c",
  G: "#8b5cf6",
  D: "#c084d8",
  BN: "#e03b32",
  BS: "#e03b32",
  VN: "#6b83e0",
  VS: "#6b83e0",
  T: "#22b8d6",
  W: "#eab308",
  S: "#f472a6",
  PW: "#64748b",
  RA: "#dc2626"
};
var ANCHOR_POINT_COLORS = { "anchor-berth": "#0f766e", buoy: "#b45309" };
var areaColorStops = Object.entries(AREA_COLORS).flat();

// src/map/anchorIcon.ts
var ANCHOR_IMAGE_ID = "anchor-mark";

// src/map/vesselTypes.ts
var VESSEL_COLORS = {
  barge: "#FFBF00",
  bulkcarrier: "#9966CC",
  cableship: "#007FFF",
  carcarrier: "#F5F5DC",
  chemicaltanker: "#0095B6",
  container: "#8A2BE2",
  crewboat: "#DE5D83",
  divingsupport: "#CD7F32",
  dredger: "#702963",
  generalcargo: "#02A4D3",
  heavyliftvsl: "#F7E7CE",
  landingcraft: "#0047AB",
  livestockcarrier: "#FF7F50",
  lngcarrier: "#50C878"
};
var VESSEL_TYPES = Object.keys(VESSEL_COLORS);
var vesselColorStops = VESSEL_TYPES.flatMap((t) => [t, VESSEL_COLORS[t]]);

// src/map/layers.ts
var EMPTY_FC = { type: "FeatureCollection", features: [] };
var FONT_REGULAR = ["Noto Sans Regular"];
var FONT_BOLD = ["Noto Sans Bold"];
var SOURCE_IDS = {
  contours: "src-contours",
  soundings: "src-soundings",
  graticule: "src-graticule",
  anchorages: "src-anchorages",
  vessels: "src-vessels",
  hulls: "src-vessel-hulls",
  swing: "src-swing",
  freeSpots: "src-free-spots",
  geofences: "src-geofences",
  transit: "src-transit",
  anchors: "src-anchors",
  anchorDrop: "src-anchor-drop",
  labels: "src-labels",
  buffer: "src-buffer",
  nearestLine: "src-nearest-line",
  playback: "src-playback",
  spotDrag: "src-spot-drag"
};
var SOUNDING_INK = "#8796ac";
var GRATICULE_INK = "#5f7391";
var geofenceColor = [
  "match",
  ["get", "kind"],
  "exclusion",
  "#dc2626",
  "advisory",
  "#d97706",
  "#64748b"
];
var anchorageColor = [
  "match",
  ["get", "code"],
  ...areaColorStops,
  // Anchor berths and channel buoys keep their own marks.
  [
    "match",
    ["get", "category"],
    "anchor-berth",
    ANCHOR_POINT_COLORS["anchor-berth"],
    "buoy",
    ANCHOR_POINT_COLORS.buoy,
    "#0369a1"
  ]
];
var vesselColor = [
  "match",
  ["get", "type"],
  ...vesselColorStops,
  "#94a3b8"
];
function addPortLayers(map) {
  const firstSymbol = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
  const add = (layer, before = firstSymbol) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, before && map.getLayer(before) ? before : void 0);
  };
  for (const id of Object.values(SOURCE_IDS)) {
    if (!map.getSource(id)) {
      map.addSource(id, { type: "geojson", data: EMPTY_FC, promoteId: "id" });
    }
  }
  add({
    id: "anchorages-fill",
    type: "fill",
    source: SOURCE_IDS.anchorages,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": anchorageColor,
      // The sea is strongly blue, so the tints need real weight to read as the
      // chart's colours rather than as shades of the water.
      "fill-opacity": ["case", ["==", ["get", "category"], "restricted"], 0.14, 0.5]
    }
  });
  add({
    id: "contours-line",
    type: "line",
    source: SOURCE_IDS.contours,
    minzoom: 9,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      // Index contours every 50 m carry the shape of the slope; the 10 m
      // lines between them are lighter so they read as infill.
      "line-color": ["case", ["get", "major"], "#2f6288", "#6a97ba"],
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        ["case", ["get", "major"], 1.6, 0.8],
        14,
        ["case", ["get", "major"], 3.2, 1.6]
      ],
      "line-opacity": 0.9
    }
  });
  add({
    id: "anchorages-outline",
    type: "line",
    source: SOURCE_IDS.anchorages,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "line-color": anchorageColor,
      "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.5, 1.6],
      "line-opacity": 0.9
    }
  });
  add({
    id: "anchorages-point",
    type: "circle",
    source: SOURCE_IDS.anchorages,
    filter: ["==", ["geometry-type"], "Point"],
    minzoom: 10,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 7],
      "circle-color": anchorageColor,
      "circle-stroke-width": 1.4,
      "circle-stroke-color": "#ffffff"
    }
  });
  add({
    id: "anchorages-point-label",
    type: "symbol",
    source: SOURCE_IDS.anchorages,
    filter: ["==", ["geometry-type"], "Point"],
    minzoom: 12,
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT_REGULAR,
      "text-size": 10,
      "text-offset": [0, 1.1]
    },
    paint: { "text-color": "#0f172a", "text-halo-color": "#f8fafc", "text-halo-width": 1.4 }
  });
  add({
    id: "anchorages-label",
    type: "symbol",
    source: SOURCE_IDS.labels,
    filter: ["==", ["get", "kind"], "anchorage"],
    layout: {
      "text-field": ["get", "label"],
      "text-font": FONT_BOLD,
      // The single-letter codes carry the map, so they are set larger.
      "text-size": ["case", ["get", "isCode"], 20, 11],
      "text-transform": "uppercase",
      "text-letter-spacing": 0.06,
      "text-max-width": 9,
      "text-allow-overlap": true
    },
    paint: { "text-color": "#0c4a6e", "text-halo-color": "#f8fafc", "text-halo-width": 1.7 }
  });
  add({
    id: "graticule-line",
    type: "line",
    source: SOURCE_IDS.graticule,
    filter: ["==", ["get", "kind"], "line"],
    minzoom: 9,
    paint: {
      "line-color": GRATICULE_INK,
      "line-width": 0.6,
      "line-opacity": 0.45
    }
  });
  add({
    id: "graticule-tick",
    type: "line",
    source: SOURCE_IDS.graticule,
    filter: ["==", ["get", "kind"], "tick"],
    minzoom: 9,
    paint: {
      "line-color": GRATICULE_INK,
      "line-width": ["case", ["get", "major"], 1.4, 0.9],
      // The tenths are a comb between the minutes; the minutes carry the scale,
      // so they stay legible where the tenths fade out zoomed away.
      "line-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        ["case", ["get", "major"], 0.75, 0],
        11.5,
        ["case", ["get", "major"], 0.85, 0.6]
      ]
    }
  });
  add({
    id: "geofence-fill",
    type: "fill",
    source: SOURCE_IDS.geofences,
    filter: ["==", ["get", "active"], true],
    paint: { "fill-color": geofenceColor, "fill-opacity": 0.3 }
  });
  add({
    id: "geofence-outline",
    type: "line",
    source: SOURCE_IDS.geofences,
    // Round caps on a near-zero dash render as dots — a geofence reads as drawn
    // by an operator rather than as a surveyed boundary.
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": geofenceColor,
      "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 4.5, 3],
      "line-dasharray": [0.1, 2],
      // A dormant fence is drawn the same way, just fainter.
      "line-opacity": ["case", ["get", "active"], 1, 0.45]
    }
  });
  add({
    id: "geofence-label",
    type: "symbol",
    source: SOURCE_IDS.geofences,
    minzoom: 11,
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT_BOLD,
      "text-size": 11,
      "text-max-width": 9,
      "text-allow-overlap": true
    },
    paint: { "text-color": "#7f1d1d", "text-halo-color": "#fff7ed", "text-halo-width": 1.8 }
  });
  add({
    id: "free-spot-fill",
    type: "fill",
    source: SOURCE_IDS.freeSpots,
    minzoom: 10.5,
    paint: { "fill-color": "#16a34a", "fill-opacity": 0.16 }
  });
  add({
    id: "free-spot-outline",
    type: "line",
    source: SOURCE_IDS.freeSpots,
    minzoom: 10.5,
    paint: {
      "line-color": "#15803d",
      "line-width": 1.2,
      "line-dasharray": [2, 2],
      "line-opacity": 0.85
    }
  });
  add({
    id: "swing-fill",
    type: "fill",
    source: SOURCE_IDS.swing,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#f59e0b",
        "#0f172a"
      ],
      "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.18, 0.05]
    }
  });
  add({
    id: "swing-outline",
    type: "line",
    source: SOURCE_IDS.swing,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#b45309",
        "#334155"
      ],
      "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, 0.7],
      "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, 0.55]
    }
  });
  add({
    id: "swing-label",
    type: "symbol",
    source: SOURCE_IDS.swing,
    filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "id"], "__none__"]],
    layout: {
      "text-field": ["concat", "swing r ", ["to-string", ["get", "radiusM"]], " m"],
      "text-font": FONT_BOLD,
      "text-size": 11,
      "text-offset": [0, -0.7],
      "text-allow-overlap": true,
      "text-ignore-placement": true
    },
    paint: { "text-color": "#b45309", "text-halo-color": "#f8fafc", "text-halo-width": 1.7 }
  });
  add({
    id: "vessels-chain",
    type: "line",
    source: SOURCE_IDS.anchors,
    filter: ["==", ["get", "kind"], "chain"],
    minzoom: 12,
    paint: { "line-color": "#0a2540", "line-width": 1.1, "line-opacity": 0.55 }
  });
  add({
    id: "vessels-anchor",
    type: "symbol",
    source: SOURCE_IDS.anchors,
    filter: ["==", ["get", "kind"], "anchor"],
    minzoom: 12,
    layout: {
      "icon-image": ANCHOR_IMAGE_ID,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 16, 0.85],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true
    }
  });
  add({
    id: "anchor-drop-ripple",
    type: "line",
    source: SOURCE_IDS.anchorDrop,
    filter: ["==", ["get", "kind"], "ripple"],
    paint: {
      "line-color": "#f8fafc",
      "line-width": 2.4,
      "line-opacity": ["get", "opacity"]
    }
  });
  add({
    id: "anchor-drop-chain",
    type: "line",
    source: SOURCE_IDS.anchorDrop,
    filter: ["==", ["get", "kind"], "chain"],
    paint: { "line-color": "#0a2540", "line-width": 1.4, "line-opacity": 0.7 }
  });
  add({
    id: "anchor-drop-icon",
    type: "symbol",
    source: SOURCE_IDS.anchorDrop,
    filter: ["==", ["get", "kind"], "anchor"],
    layout: {
      "icon-image": ANCHOR_IMAGE_ID,
      "icon-size": ["get", "size"],
      "icon-rotate": ["get", "rotation"],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true
    }
  });
  add({
    id: "transit-plan",
    type: "line",
    source: SOURCE_IDS.transit,
    filter: ["all", ["==", ["geometry-type"], "LineString"], ["==", ["get", "planned"], true]],
    layout: { "line-cap": "round" },
    paint: {
      "line-color": "#b45309",
      "line-width": 1.6,
      "line-dasharray": [1, 2.5],
      "line-opacity": 0.6
    }
  });
  add({
    id: "transit-track",
    type: "line",
    source: SOURCE_IDS.transit,
    filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "planned"], true]],
    layout: { "line-cap": "round" },
    paint: { "line-color": "#b45309", "line-width": 2.6, "line-dasharray": [2, 1.6] }
  });
  add({
    id: "transit-hull",
    type: "fill-extrusion",
    source: SOURCE_IDS.transit,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-extrusion-color": "#f59e0b",
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-opacity": 0.95
    }
  });
  add({
    id: "vessels-halo",
    type: "circle",
    source: SOURCE_IDS.vessels,
    paint: {
      "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 17, 0],
      "circle-color": "#fde047",
      "circle-opacity": 0.5,
      "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 1.5, 0],
      "circle-stroke-color": "#a16207"
    }
  });
  add({
    id: "vessels-circle",
    type: "symbol",
    source: SOURCE_IDS.vessels,
    layout: {
      "icon-image": [
        "coalesce",
        ["image", ["concat", "ship-", ["get", "type"]]],
        ["image", "ship-unknown"]
      ],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 1.15],
      "icon-rotate": ["get", "headingDeg"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true
    }
  });
  add({
    id: "vessels-hull-3d",
    type: "fill-extrusion",
    source: SOURCE_IDS.hulls,
    paint: {
      "fill-extrusion-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#fde047",
        [
          "case",
          ["==", ["get", "part"], "superstructure"],
          "#f1f5f9",
          vesselColor
        ]
      ],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-opacity": 0.92,
      "fill-extrusion-vertical-gradient": true
    }
  });
  add({
    id: "vessels-label",
    type: "symbol",
    source: SOURCE_IDS.vessels,
    filter: ["==", ["get", "id"], "__none__"],
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT_REGULAR,
      "text-size": 11,
      "text-offset": [0, 1.3]
    },
    paint: { "text-color": "#0f172a", "text-halo-color": "#f8fafc", "text-halo-width": 1.6 }
  });
  add({
    id: "contours-label",
    type: "symbol",
    source: SOURCE_IDS.contours,
    minzoom: 10,
    layout: {
      "text-field": ["concat", ["to-string", ["get", "depthM"]], " m"],
      "text-font": FONT_BOLD,
      "text-size": ["case", ["get", "major"], 11, 10],
      "symbol-placement": "line",
      "symbol-spacing": 240,
      "text-rotation-alignment": "map",
      "text-pitch-alignment": "viewport"
    },
    paint: {
      "text-color": ["case", ["get", "major"], "#1e4a6d", "#3f7096"],
      "text-halo-color": "#f8fafc",
      "text-halo-width": 1.8,
      // Every 50 m is labelled from the start; the 10 m lines only name
      // themselves once there is room for them.
      "text-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        11.5,
        ["case", ["get", "major"], 1, 0],
        12.5,
        1
      ]
    }
  });
  add({
    id: "graticule-label",
    type: "symbol",
    source: SOURCE_IDS.graticule,
    filter: ["==", ["get", "kind"], "line"],
    minzoom: 10,
    layout: {
      "text-field": ["get", "label"],
      "text-font": FONT_REGULAR,
      "text-size": 10,
      "symbol-placement": "line",
      "symbol-spacing": 320,
      "text-rotation-alignment": "map",
      "text-pitch-alignment": "viewport",
      // Clear of the line it names, on the side the sheet writes it.
      "text-offset": [0, -0.7]
    },
    paint: {
      "text-color": GRATICULE_INK,
      "text-halo-color": "#f8fafc",
      "text-halo-width": 1.6,
      "text-opacity": 0.9
    }
  });
  add({
    id: "soundings-label",
    type: "symbol",
    source: SOURCE_IDS.soundings,
    minzoom: 10,
    layout: {
      "text-field": ["to-string", ["get", "depthM"]],
      "text-font": FONT_REGULAR,
      "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 11],
      "symbol-sort-key": ["get", "tier"],
      // The density knob. Padding is the space a sounding reserves against its
      // neighbours, so raising it is what actually thins the field — the
      // generator only decides how many are *available* to place.
      "text-padding": 18
    },
    paint: {
      // Set well back from the contour labels: a sounding is read off, not
      // followed, and 1400 of them at contour weight would bury the chart. The
      // tone is the console's own --muted lifted a quarter toward white, so the
      // field of figures reads as the same navy-on-white as the rest of the UI.
      "text-color": SOUNDING_INK,
      "text-halo-color": "#f8fafc",
      "text-halo-width": 1.2,
      "text-opacity": 0.9
    }
  });
  add(
    {
      id: "buffer-fill",
      type: "fill",
      source: SOURCE_IDS.buffer,
      paint: { "fill-color": "#f59e0b", "fill-opacity": 0.16 }
    },
    "vessels-halo"
  );
  add(
    {
      id: "buffer-outline",
      type: "line",
      source: SOURCE_IDS.buffer,
      paint: { "line-color": "#b45309", "line-width": 1.8, "line-dasharray": [3, 2] }
    },
    "vessels-halo"
  );
  add({
    id: "spot-drag-fill",
    type: "fill",
    source: SOURCE_IDS.spotDrag,
    paint: {
      "fill-color": ["case", ["get", "ok"], "#16a34a", "#dc2626"],
      "fill-opacity": 0.22
    }
  });
  add({
    id: "spot-drag-outline",
    type: "line",
    source: SOURCE_IDS.spotDrag,
    paint: {
      "line-color": ["case", ["get", "ok"], "#15803d", "#b91c1c"],
      "line-width": 2.4
    }
  });
  add({
    id: "playback-done",
    type: "line",
    source: SOURCE_IDS.playback,
    filter: ["==", ["get", "kind"], "done"],
    paint: { "line-color": "#1b56b5", "line-width": 3.2, "line-opacity": 0.85 }
  });
  add({
    id: "nearest-line",
    type: "line",
    source: SOURCE_IDS.nearestLine,
    paint: { "line-color": "#b45309", "line-width": 2.2, "line-dasharray": [1, 1] }
  });
  add({
    id: "nearest-line-label",
    type: "symbol",
    source: SOURCE_IDS.nearestLine,
    layout: {
      "text-field": ["concat", ["to-string", ["round", ["get", "distanceM"]]], " m"],
      "text-font": FONT_REGULAR,
      "symbol-placement": "line-center",
      "text-size": 11
    },
    paint: { "text-color": "#b45309", "text-halo-color": "#f8fafc", "text-halo-width": 1.6 }
  });
}

// layers-check.tmp.mts
var layers = [];
var sources = {};
var fake = {
  getStyle: () => ({ layers }),
  getLayer: (id) => layers.find((l) => l.id === id),
  getSource: (id) => sources[id],
  addSource: (id, src) => {
    sources[id] = src;
  },
  addLayer: (layer) => {
    layers.push(layer);
  }
};
addPortLayers(fake);
console.log("layers added:", layers.length);
var style = {
  version: 8,
  name: "check",
  glyphs: "https://example.com/{fontstack}/{range}.pbf",
  sources: Object.fromEntries(
    Object.values(SOURCE_IDS).map((id) => [
      id,
      { type: "geojson", data: { type: "FeatureCollection", features: [] } }
    ])
  ),
  layers
};
var errors = validateStyleMin(style);
if (!errors.length) {
  console.log("style validates clean");
} else {
  for (const e of errors) console.log("ERROR", e.message);
}
var used = new Set(layers.map((l) => l.source));
for (const id of Object.values(SOURCE_IDS)) {
  if (!used.has(id)) console.log("ORPHAN SOURCE", id);
}
