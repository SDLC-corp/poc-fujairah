import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, Popup, ScaleControl } from 'maplibre-gl'
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import { centroid } from '@turf/turf'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { clearSelection, selectFeature } from '../features/selection/selectionSlice'
import {
  selectBufferFeature,
  selectLabelPoints,
  selectNearestBerthLine,
  selectAnchorMarks,
  selectFreeSpots,
  selectSwingCircles,
  selectVesselHulls,
} from '../features/analysis/selectors'
import { setBearing, setPitch } from '../features/view/viewSlice'
import { dismissArrival, finishTransit } from '../features/transit/transitSlice'
import { anchorVessel } from '../features/portData/portDataSlice'
import { buildVesselHull } from '../map/vesselGeometry'
import { registerAnchorIcon } from '../map/anchorIcon'
import {
  along,
  bbox,
  bearing as turfBearing,
  circle as turfCircle,
  destination,
  length as turfLength,
  lineString,
} from '@turf/turf'
import '../map/workerSetup'
import {
  BASEMAP_STYLE,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  MAX_PITCH,
  PITCHED_VIEW,
  PORT_BOUNDS,
} from '../map/basemaps'
import {
  addPortLayers,
  configureBuildingLayer,
  configureNameLayers,
  EMPTY_FC,
  findBuildingLayer,
  FLAT_VESSEL_LAYERS,
  INTERACTIVE_LAYERS,
  LAYER_GROUPS,
  SOURCE_IDS,
  THREE_D_VESSEL_LAYERS,
} from '../map/layers'
import type { LayerId } from '../types/gis'

/** Maps a clicked style layer back to the toggleable data layer it belongs to. */
const LAYER_OF: Record<string, LayerId> = {
  'vessels-hull-3d': 'vessels',
  'vessels-circle': 'vessels',
  'anchorages-point': 'anchorages',
  'anchorages-fill': 'anchorages',
  'geofence-fill': 'geofences',
}

/** Sources carrying a layer's features — vessels are drawn from two. */
const SOURCES_OF: Record<LayerId, string[]> = {
  vessels: [SOURCE_IDS.vessels, SOURCE_IDS.hulls, SOURCE_IDS.swing],
  anchorages: [SOURCE_IDS.anchorages],
  swing: [SOURCE_IDS.swing],
  freeSpots: [SOURCE_IDS.freeSpots],
  geofences: [SOURCE_IDS.geofences],
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const prevSelectionRef = useRef<{ sources: string[]; id: string } | null>(null)
  const buildingLayerRef = useRef<string | null>(null)
  const nameLayersRef = useRef<string[]>([])
  const framedTransitRef = useRef<number | null>(null)
  // Bumped every time the port layers are (re-)attached to a style. Effects key
  // off it instead of a boolean so a style reload re-pushes data and state.
  const [styleEpoch, setStyleEpoch] = useState(0)

  const dispatch = useAppDispatch()
  const buildings3d = useAppSelector((s) => s.layers.buildings3d)
  const mapNames = useAppSelector((s) => s.layers.mapNames)
  const visible = useAppSelector((s) => s.layers.visible)
  const selected = useAppSelector((s) => s.selection.selected)
  const vessels = useAppSelector((s) => s.portData.vessels)
  const anchorages = useAppSelector((s) => s.portData.anchorages)
  const geofences = useAppSelector((s) => s.portData.geofences)
  const showBuffer = useAppSelector((s) => s.analysis.showBuffer)
  const showNearestLine = useAppSelector((s) => s.analysis.showNearestBerthLine)
  const bufferFeature = useAppSelector(selectBufferFeature)
  const nearest = useAppSelector(selectNearestBerthLine)
  const vessels3d = useAppSelector((s) => s.layers.vessels3d)
  const hulls = useAppSelector(selectVesselHulls)
  const swingCircles = useAppSelector(selectSwingCircles)
  const freeSpots = useAppSelector(selectFreeSpots)
  const anchorMarks = useAppSelector(selectAnchorMarks)
  const labelPoints = useAppSelector(selectLabelPoints)
  const pitch = useAppSelector((s) => s.view.pitch)
  const bearing = useAppSelector((s) => s.view.bearing)
  const focusRequest = useAppSelector((s) => s.view.focusRequest)
  const transit = useAppSelector((s) => s.transit.active)
  const arrival = useAppSelector((s) => s.transit.arrived)

  /* Create the map once. */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: vessels3d ? PITCHED_VIEW : 0,
      maxPitch: MAX_PITCH,
      attributionControl: { compact: true },
    })
    // Right-click / ctrl-drag rotation is on by default; mirror whatever the
    // user does with it back into the store so the camera sliders stay honest.
    const syncCamera = () => {
      dispatch(setPitch(Number(map.getPitch().toFixed(1))))
      dispatch(setBearing(Number(map.getBearing().toFixed(1))))
    }
    map.on('pitchend', syncCamera)
    map.on('rotateend', syncCamera)
    mapRef.current = map
    if (import.meta.env.DEV) {
      ;(window as unknown as { __map?: MapLibreMap }).__map = map
    }

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')

    // Vector styles finish loading in stages, so rather than betting on one
    // event, attach the port layers as soon as the style can hold them and
    // re-attach if anything ever drops them.
    const ensurePortLayers = () => {
      if (map.getSource(SOURCE_IDS.anchorages)) return
      registerAnchorIcon(map)
      addPortLayers(map)
      const buildingLayer = findBuildingLayer(map)
      if (buildingLayer) configureBuildingLayer(map, buildingLayer)
      buildingLayerRef.current = buildingLayer ?? null
      nameLayersRef.current = configureNameLayers(map)
      setStyleEpoch((epoch) => epoch + 1)
    }
    map.on('load', ensurePortLayers)
    map.on('styledata', ensurePortLayers)

    map.on('click', (e: MapMouseEvent) => {
      const layers = INTERACTIVE_LAYERS.filter((id) => map.getLayer(id))
      const hits = map.queryRenderedFeatures(e.point, { layers })
      // queryRenderedFeatures answers in render order (big area fills first), so
      // rank by INTERACTIVE_LAYERS instead or a ship inside an area never wins.
      const hit = hits
        .filter((f) => LAYER_OF[f.layer.id])
        .sort((a, b) => INTERACTIVE_LAYERS.indexOf(a.layer.id) - INTERACTIVE_LAYERS.indexOf(b.layer.id))[0]
      if (!hit) {
        dispatch(clearSelection())
        return
      }
      const id = (hit.properties?.id ?? hit.id) as string | undefined
      if (!id) return
      dispatch(selectFeature({ layer: LAYER_OF[hit.layer.id], id }))
    })

    map.on('mousemove', (e: MapMouseEvent) => {
      const layers = INTERACTIVE_LAYERS.filter((id) => map.getLayer(id))
      const hits = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : []
      map.getCanvas().style.cursor = hits.length ? 'pointer' : ''
    })

    return () => {
      map.remove()
      mapRef.current = null
      setStyleEpoch(0)
    }
    // The map is created once; camera state is read here only as the initial
    // view and is driven by its own effect afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch])

  /* 3D buildings come from the basemap's own extrusion layer. */
  useEffect(() => {
    const map = mapRef.current
    const id = buildingLayerRef.current
    if (!map || !styleEpoch || !id || !map.getLayer(id)) return
    map.setLayoutProperty(id, 'visibility', buildings3d ? 'visible' : 'none')
  }, [styleEpoch, buildings3d])

  /* Street / building / place names, likewise straight from the basemap. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch) return
    for (const id of nameLayersRef.current) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', mapNames ? 'visible' : 'none')
      }
    }
  }, [styleEpoch, mapNames])

  /* Push the loaded GeoJSON into the map sources. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch) return
    const pairs: [string, FeatureCollection | null][] = [
      [SOURCE_IDS.anchorages, anchorages],
      [SOURCE_IDS.vessels, vessels],
      [SOURCE_IDS.hulls, hulls],
      [SOURCE_IDS.swing, swingCircles],
      [SOURCE_IDS.freeSpots, freeSpots],
      [SOURCE_IDS.anchors, anchorMarks],
      [SOURCE_IDS.geofences, geofences],
      [SOURCE_IDS.labels, labelPoints],
    ]
    for (const [sourceId, data] of pairs) {
      const source = map.getSource(sourceId) as GeoJSONSource | undefined
      source?.setData(data ?? EMPTY_FC)
    }
  }, [
    styleEpoch,
    anchorages,
    geofences,
    vessels,
    hulls,
    swingCircles,
    freeSpots,
    anchorMarks,
    labelPoints,
  ])

  /* Walk an assigned vessel from where it waited to its spot. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch) return

    const transitSource = () => map.getSource(SOURCE_IDS.transit) as GeoJSONSource | undefined

    // While a vessel is in transit its static copy is hidden, so it does not
    // appear twice — once at the old berth and once under way.
    const hideId = transit?.vesselId ?? '__none__'
    for (const id of ['vessels-hull-3d', 'vessels-circle']) {
      if (map.getLayer(id)) map.setFilter(id, ['!=', ['get', 'id'], hideId])
    }
    if (map.getLayer('swing-fill')) {
      map.setFilter('swing-fill', [
        'all',
        ['==', ['geometry-type'], 'Polygon'],
        ['!=', ['get', 'id'], hideId],
      ])
    }
    if (map.getLayer('swing-outline')) {
      map.setFilter('swing-outline', [
        'all',
        ['==', ['geometry-type'], 'Polygon'],
        ['!=', ['get', 'id'], hideId],
      ])
    }

    if (!transit) {
      transitSource()?.setData(EMPTY_FC)
      return
    }

    const moving = vessels?.features.find((v) => v.properties.id === transit.vesselId)
    if (!moving) return

    // Frame both ends of the move so the passage is actually watchable.
    if (framedTransitRef.current !== transit.startedAt) {
      framedTransitRef.current = transit.startedAt
      const lons = transit.path.map((p) => p[0])
      const lats = transit.path.map((p) => p[1])
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 140, maxZoom: 13, duration: 900 },
      )
    }

    const route = lineString(transit.path.length > 1 ? transit.path : [transit.from, transit.to])
    const routeKm = turfLength(route, { units: 'kilometers' })
    let frame = 0

    const draw = () => {
      const elapsed = Date.now() - transit.startedAt
      // Ease in and out so the ship gathers way and then slows onto the spot.
      const linear = Math.min(1, elapsed / transit.durationMs)
      const t = linear < 0.5 ? 2 * linear * linear : 1 - (-2 * linear + 2) ** 2 / 2

      const at = along(route, routeKm * t, { units: 'kilometers' }).geometry.coordinates
      // Look a little further along the track so the hull points where it is going.
      const ahead = along(route, Math.min(routeKm, routeKm * t + 0.25), {
        units: 'kilometers',
      }).geometry.coordinates
      const heading = routeKm > 0 && t < 1 ? turfBearing(at, ahead) : turfBearing(transit.from, transit.to)

      const hull = buildVesselHull({
        ...moving,
        properties: { ...moving.properties, headingDeg: heading },
        geometry: { type: 'Point', coordinates: at },
      })
      // The trail is the part of the route already run.
      const trail = transit.path.filter((_, i) => i === 0)
      transitSource()?.setData({
        type: 'FeatureCollection',
        features: [
          ...hull,
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [...trail, at] },
          },
          {
            type: 'Feature',
            properties: { planned: true },
            geometry: { type: 'LineString', coordinates: transit.path },
          },
        ],
      } as FeatureCollection)

      if (linear >= 1) {
        dispatch(
          anchorVessel({
            vesselId: transit.vesselId,
            coordinates: transit.to,
            areaCode: transit.areaCode,
            headingDeg: heading,
          }),
        )
        dispatch(finishTransit())
        return
      }
      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [styleEpoch, transit, vessels, dispatch])

  /* Let go: the anchor falls ahead of the bow, the cable pays out, splash. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch) return

    const source = () => map.getSource(SOURCE_IDS.anchorDrop) as GeoJSONSource | undefined
    // The settled anchor mark is suppressed until the drop has played out.
    const hideId = arrival?.vesselId ?? '__none__'
    for (const id of ['vessels-anchor', 'vessels-chain']) {
      if (!map.getLayer(id)) continue
      const kind = id === 'vessels-anchor' ? 'anchor' : 'chain'
      map.setFilter(id, [
        'all',
        ['==', ['get', 'kind'], kind],
        ['!=', ['get', 'id'], hideId],
      ])
    }

    if (!arrival) {
      source()?.setData(EMPTY_FC)
      return
    }

    const vessel = vessels?.features.find((v) => v.properties.id === arrival.vesselId)
    if (!vessel) return

    const cableM = vessel.properties.lengthM * 1.2
    const seabed = destination(arrival.at, cableM / 1000, vessel.properties.headingDeg, {
      units: 'kilometers',
    }).geometry.coordinates as [number, number]

    const DURATION = 1500
    const started = Date.now()
    let frame = 0

    const draw = () => {
      const t = Math.min(1, (Date.now() - started) / DURATION)
      // Overshoot slightly at the end so the anchor lands with some weight.
      const c1 = 1.70158
      const settle = 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2
      const at: [number, number] = [
        arrival.at[0] + (seabed[0] - arrival.at[0]) * settle,
        arrival.at[1] + (seabed[1] - arrival.at[1]) * settle,
      ]

      const features: Feature[] = [
        {
          type: 'Feature',
          properties: { kind: 'chain' },
          geometry: { type: 'LineString', coordinates: [arrival.at, at] },
        },
        {
          type: 'Feature',
          // Tumbling as it falls, upright once it is on the bottom.
          properties: { kind: 'anchor', size: 0.4 + 0.5 * t, rotation: 300 * (1 - t) },
          geometry: { type: 'Point', coordinates: at },
        },
      ]

      // Splash rings, once the anchor is in the water.
      if (t > 0.55) {
        const splash = (t - 0.55) / 0.45
        for (const offset of [0, 0.35]) {
          const ring = Math.max(0, splash - offset)
          if (ring <= 0) continue
          features.push({
            type: 'Feature',
            properties: { kind: 'ripple', opacity: Math.max(0, 0.75 * (1 - ring)) },
            geometry: turfCircle(at, (ring * cableM * 0.9) / 1000, {
              units: 'kilometers',
              steps: 28,
            }).geometry,
          })
        }
      }

      source()?.setData({ type: 'FeatureCollection', features } as FeatureCollection)
      if (t < 1) frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [styleEpoch, arrival, vessels])

  /* Confirm the arrival on the map itself. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch || !arrival) return

    const popup = new Popup({ closeButton: true, offset: 14, className: 'arrival-popup' })
      .setLngLat(arrival.at)
      .setHTML(
        `<strong>${arrival.name}</strong><span>Anchored — Area ${arrival.areaCode}</span>` +
          `<small>spot ${arrival.spotId}</small>`,
      )
      .addTo(map)

    const timer = setTimeout(() => dispatch(dismissArrival()), 7000)
    return () => {
      clearTimeout(timer)
      popup.remove()
    }
  }, [styleEpoch, arrival, dispatch])

  /* Camera presets: the port quay, or the whole Fujairah Anchorage Area. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch || !focusRequest) return
    if (focusRequest.target === 'anchorage' && anchorages?.features.length) {
      const [w, s, e, n] = bbox(anchorages)
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 40, duration: 900 },
      )
    } else {
      map.fitBounds(PORT_BOUNDS, { padding: 50, duration: 900 })
    }
  }, [styleEpoch, focusRequest, anchorages])

  /* Drive the camera from the store; map gestures push their result back. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch) return
    const pitchOff = Math.abs(map.getPitch() - pitch) > 0.5
    const bearingOff = Math.abs(map.getBearing() - bearing) > 0.5
    if (!pitchOff && !bearingOff) return
    map.easeTo({ pitch, bearing, duration: 500 })
  }, [styleEpoch, pitch, bearing])

  /* Layer visibility toggles. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch) return
    for (const [layer, styleLayers] of Object.entries(LAYER_GROUPS)) {
      for (const id of styleLayers) {
        // Flat dots and extruded hulls are two renderings of the same layer,
        // so the 3D switch decides which half of the vessel group is drawn.
        let on = visible[layer as LayerId]
        if (FLAT_VESSEL_LAYERS.includes(id)) on = on && !vessels3d
        if (THREE_D_VESSEL_LAYERS.includes(id)) on = on && vessels3d
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
      }
    }
  }, [styleEpoch, visible, vessels3d])

  /* Selection highlight via feature-state, plus a pan when the pick is off-screen. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch) return

    const prev = prevSelectionRef.current
    if (prev) {
      for (const source of prev.sources) {
        map.setFeatureState({ source, id: prev.id }, { selected: false })
      }
    }
    prevSelectionRef.current = null
    if (!selected) {
      if (map.getLayer('swing-label')) {
        map.setFilter('swing-label', [
          'all',
          ['==', ['geometry-type'], 'Point'],
          ['==', ['get', 'id'], '__none__'],
        ])
      }
      if (map.getLayer('vessels-label')) {
        map.setFilter('vessels-label', ['==', ['get', 'id'], '__none__'])
      }
      return
    }

    if (map.getLayer('swing-label')) {
      map.setFilter('swing-label', [
        'all',
        ['==', ['geometry-type'], 'Point'],
        ['==', ['get', 'id'], selected.id],
      ])
    }
    // Only the clicked vessel is named on the map.
    if (map.getLayer('vessels-label')) {
      const id = selected.layer === 'vessels' ? selected.id : '__none__'
      map.setFilter('vessels-label', ['==', ['get', 'id'], id])
    }

    const sources = SOURCES_OF[selected.layer]
    for (const source of sources) {
      map.setFeatureState({ source, id: selected.id }, { selected: true })
    }
    prevSelectionRef.current = { sources, id: selected.id }

    const collection = { anchorages, vessels, swing: vessels, freeSpots: null, geofences }[
      selected.layer
    ]
    const feature = collection?.features.find((f) => f.properties.id === selected.id)
    if (!feature) return
    const [lng, lat] = centroid(feature).geometry.coordinates
    if (!map.getBounds().contains([lng, lat])) {
      map.easeTo({ center: [lng, lat], duration: 600 })
    }
  }, [styleEpoch, selected, anchorages, geofences, vessels])

  /* Turf-derived analysis overlays. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch) return

    const bufferSource = map.getSource(SOURCE_IDS.buffer) as GeoJSONSource | undefined
    bufferSource?.setData(
      showBuffer && bufferFeature
        ? { type: 'FeatureCollection', features: [bufferFeature] }
        : EMPTY_FC,
    )

    const lineSource = map.getSource(SOURCE_IDS.nearestLine) as GeoJSONSource | undefined
    lineSource?.setData(
      showNearestLine && nearest ? { type: 'FeatureCollection', features: [nearest.line] } : EMPTY_FC,
    )
  }, [styleEpoch, bufferFeature, nearest, showBuffer, showNearestLine])

  return <div ref={containerRef} className="map-canvas" />
}
