import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl, Popup, ScaleControl } from 'maplibre-gl'
import type { GeoJSONSource, MapMouseEvent, MapTouchEvent } from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import { centroid, pointOnFeature } from '@turf/turf'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { clearSelection, selectFeature } from '../features/selection/selectionSlice'
import {
  cableLengthM,
  checkSpotAt,
  selectAreas,
  selectBufferFeature,
  selectLabelPoints,
  selectNearestBerthLine,
  selectAnchorMarks,
  selectFreeSpots,
  selectGeofences,
  selectSwingCircles,
  selectVesselHulls,
} from '../features/analysis/selectors'
import type { FreeSpotProps } from '../features/analysis/selectors'
import { setBearing, setPitch } from '../features/view/viewSlice'
import { dismissArrival, finishTransit } from '../features/transit/transitSlice'
import { anchorVessel } from '../features/portData/portDataSlice'
import {
  cancelRelocate,
  clearSpot,
  moveSpot,
  pickSpot,
  resetSpot,
  selectSpot,
  startRelocate,
} from '../features/spots/spotsSlice'
import { indexAt, sampleAt, trackLine } from '../utils/playbackTrack'
import { buildVesselHull } from '../map/vesselGeometry'
import { buildGraticule } from '../map/graticule'
import { registerAnchorIcon } from '../map/anchorIcon'
import { registerVesselIcons } from '../map/vesselIcon'
import { VESSEL_LABELS } from '../map/vesselTypes'
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
import type { LayerId, VesselCollection, VesselFeature, VesselProps, VesselType } from '../types/gis'

/** Popup bodies are built as HTML, so anything from the data is escaped first. */
function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}

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
  // Chart furniture is backdrop — not in INTERACTIVE_LAYERS, never selected.
  contours: [],
  soundings: [],
  graticule: [],
  compass: [],
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
  /** Popup opened by an alert click; replaced or cleared on the next focus. */
  const focusPopupRef = useRef<Popup | null>(null)
  /**
   * Nonce of the last focus request actually acted on. The request carries `n`
   * precisely so asking twice re-fires, but the effect also depends on the
   * vessel, area and geofence data — so without this, any change to those
   * re-runs an old request. Anchoring a vessel changes the vessel data, which
   * is why a completed move used to end by flying back and re-opening the
   * vessel popup over a ship that had just been parked.
   */
  const handledFocusRef = useRef<number | null>(null)
  /** Handle, details card and identity of the free spot under inspection. */
  const spotMarkerRef = useRef<Marker | null>(null)
  const spotPopupRef = useRef<Popup | null>(null)
  const spotIdRef = useRef<string | null>(null)
  /**
   * Popup.remove() fires 'close'. Without this, rebuilding the card on a mode
   * change would look like the operator dismissing it and wipe the selection.
   */
  const spotClosingRef = useRef(false)
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
  const contours = useAppSelector((s) => s.portData.contours)
  const soundings = useAppSelector((s) => s.portData.soundings)
  // Geometry, not data: the graticule is fixed by the coordinate system itself,
  // so it is built once rather than fetched or stored.
  const graticule = useMemo(() => buildGraticule(), [])
  const geofences = useAppSelector(selectGeofences)
  const showBuffer = useAppSelector((s) => s.analysis.showBuffer)
  const showNearestLine = useAppSelector((s) => s.analysis.showNearestBerthLine)
  const swingFactor = useAppSelector((s) => s.analysis.swingFactor)
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
  const selectedSpotId = useAppSelector((s) => s.spots.selectedId)
  const relocating = useAppSelector((s) => s.spots.relocating)
  const pickingFor = useAppSelector((s) => s.spots.pickingFor)
  const playbackVesselId = useAppSelector((s) => s.playback.vesselId)
  const playbackProgress = useAppSelector((s) => s.playback.progress)
  const playbackData = useAppSelector((s) => s.playback.data)
  const activeTab = useAppSelector((s) => s.ui.activeTab)
  const movedSpots = useAppSelector((s) => s.spots.moved)
  const areas = useAppSelector(selectAreas)
  const safetyMarginM = useAppSelector((s) => s.analysis.safetyMarginM)

  // Drag handlers are attached once but must validate against current state,
  // so everything they read goes through a ref rather than a stale closure.
  const spotStateRef = useRef({ relocating, pickingFor })
  spotStateRef.current = { relocating, pickingFor }
  /**
   * A move owns the map while it runs. Read through a ref so the effects that
   * consult it are not re-run by the transit itself — they only need to know
   * whether one is under way at the moment they fire.
   */
  const transitRef = useRef(transit)
  transitRef.current = transit
  /** Last track framed, so the camera is not yanked on every scrub. */
  const fittedTrackRef = useRef<string | null>(null)
  /** Read inside the framing effect without making it re-run on every frame. */
  const playbackProgressRef = useRef(0)
  /** True while the map is showing the replayed fleet rather than the snapshot. */
  const replayingRef = useRef(false)
  replayingRef.current = activeTab === 'playback'
  playbackProgressRef.current = playbackProgress
  const areasRef = useRef(areas)
  areasRef.current = areas
  const vesselsRef = useRef(vessels?.features ?? [])
  vesselsRef.current = vessels?.features ?? []
  const freeSpotsRef = useRef(freeSpots.features)
  freeSpotsRef.current = freeSpots.features
  const swingFactorRef = useRef(swingFactor)
  swingFactorRef.current = swingFactor
  const safetyMarginRef = useRef(safetyMarginM)
  safetyMarginRef.current = safetyMarginM
  const movedSpotsRef = useRef(movedSpots)
  movedSpotsRef.current = movedSpots

  /**
   * On the playback screen the fleet comes from the recorded day rather than
   * the live snapshot. Shaping it as ordinary VesselFeatures means the icon,
   * the extruded hull and the selection halo all work on it untouched — no
   * parallel set of playback-only layers.
   */
  const playbackFleet = useMemo<VesselCollection | null>(() => {
    if (activeTab !== 'playback' || !playbackData) return null
    const features: VesselFeature[] = []
    for (const v of playbackData.vessels) {
      const fix = sampleAt(v.track, playbackProgress)
      if (!fix) continue
      features.push({
        type: 'Feature',
        id: v.id,
        properties: {
          id: v.id,
          name: v.name,
          imo: v.imo,
          type: v.type as VesselType,
          flag: v.flag,
          lengthM: v.lengthM,
          beamM: v.beamM,
          draftM: v.draftM,
          speedKn: fix.speedKn,
          headingDeg: fix.headingDeg,
          status: fix.status as VesselProps['status'],
          area: v.area,
          ata: null,
          etd: null,
        },
        geometry: { type: 'Point', coordinates: [fix.lon, fix.lat] },
      })
    }
    return { type: 'FeatureCollection', features }
  }, [activeTab, playbackData, playbackProgress])

  const playbackHulls = useMemo<FeatureCollection | null>(
    () =>
      playbackFleet
        ? { type: 'FeatureCollection', features: playbackFleet.features.flatMap(buildVesselHull) }
        : null,
    [playbackFleet],
  )

  /* Create the map once. */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const container = containerRef.current

    const map = new MapLibreMap({
      container,
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
    // Also while the drag is still running, so the compass rose turns with the
    // map instead of snapping round when the gesture ends. The camera effect
    // ignores a store value the map already holds, so this cannot fight it.
    map.on('rotate', syncCamera)
    mapRef.current = map

    /**
     * MapLibre watches the window, not its own container. The map is built
     * inside a CSS grid that has not finished resolving — `.dash-body` sizes
     * its map column against a sibling that is still measuring, and the split
     * screens hand the pane whatever is left after a 520 px panel — so the
     * canvas gets locked to the first size the container reports, which is tall
     * and narrow, and stays that shape until something happens to resize the
     * window. That is the map that loads portrait and then snaps landscape.
     * Watching the container instead fixes the size the moment layout settles,
     * and keeps it right when a panel opens or a tab changes the pane's width.
     */
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)
    if (import.meta.env.DEV) {
      ;(window as unknown as { __map?: MapLibreMap }).__map = map
    }

    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    // Both bars, because both units are in use here: swing circles and safety
    // margins are worked in metres, but a passage distance is read in miles —
    // and a mile is what the graticule's parallels are graduated in.
    map.addControl(new ScaleControl({ unit: 'nautical' }), 'bottom-left')

    // Vector styles finish loading in stages, so rather than betting on one
    // event, attach the port layers as soon as the style can hold them and
    // re-attach if anything ever drops them.
    const ensurePortLayers = () => {
      if (map.getSource(SOURCE_IDS.anchorages)) return
      registerAnchorIcon(map)
      registerVesselIcons(map)
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
      // While a spot is being dragged the map's clicks belong to it.
      if (spotStateRef.current.relocating) return

      // A free spot wins over whatever area it sits in — it is the smaller,
      // more specific target and the only one that can be relocated.
      if (map.getLayer('free-spot-fill')) {
        const spotHit = map.queryRenderedFeatures(e.point, { layers: ['free-spot-fill'] })[0]
        if (spotHit) {
          const spotId = (spotHit.properties?.id ?? spotHit.id) as string | undefined
          if (spotId) {
            // Armed from the assignment card: this click chooses the spot.
            const forVessel = spotStateRef.current.pickingFor
            if (forVessel) dispatch(pickSpot({ vesselId: forVessel, spotId }))
            else dispatch(selectSpot(spotId))
            return
          }
        }
      }

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
      // A click only selects — during playback that opens the details card
      // without touching the transport. Following is an explicit choice.
      dispatch(selectFeature({ layer: LAYER_OF[hit.layer.id], id }))
    })

    map.on('mousemove', (e: MapMouseEvent) => {
      const layers = [
        ...(map.getLayer('free-spot-fill') ? ['free-spot-fill'] : []),
        ...INTERACTIVE_LAYERS.filter((id) => map.getLayer(id)),
      ]
      const hits = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : []
      map.getCanvas().style.cursor = hits.length ? 'pointer' : ''
    })

    return () => {
      resizeObserver.disconnect()
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
      [SOURCE_IDS.contours, contours],
      [SOURCE_IDS.soundings, soundings],
      [SOURCE_IDS.graticule, graticule],
      [SOURCE_IDS.anchorages, anchorages],
      [SOURCE_IDS.vessels, playbackFleet ?? vessels],
      [SOURCE_IDS.hulls, playbackHulls ?? hulls],
      // Swing circles, anchor marks and free spots all describe the snapshot,
      // so they are dropped rather than shown against a replayed fleet.
      [SOURCE_IDS.swing, playbackFleet ? null : swingCircles],
      [SOURCE_IDS.freeSpots, playbackFleet ? null : freeSpots],
      [SOURCE_IDS.anchors, playbackFleet ? null : anchorMarks],
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
    contours,
    soundings,
    graticule,
    geofences,
    vessels,
    hulls,
    swingCircles,
    freeSpots,
    anchorMarks,
    labelPoints,
    playbackFleet,
    playbackHulls,
  ])

  /**
   * Clear the deck before a move. By the time a vessel is ordered to its spot
   * the map is carrying the leftovers of choosing it: the popup from focusing
   * the vessel, pinned to the berth it is about to leave, and the free spot's
   * inspection card, over water that is about to be occupied. Both are stale
   * the moment the ship gathers way, and the passage is the thing to watch —
   * so they go first, and the arrival's own popup is then the only one that
   * opens. Keyed on `startedAt`, so it runs once per move and not on every
   * frame of one.
   */
  useEffect(() => {
    if (!transit) return
    focusPopupRef.current?.remove()
    focusPopupRef.current = null
    if (selectedSpotId) dispatch(clearSpot())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transit?.startedAt])

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

    const cableM = cableLengthM(vessel.properties.lengthM, swingFactor)
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
  }, [styleEpoch, arrival, vessels, swingFactor])

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

  /* Camera presets: the port quay, the whole Anchorage Area, or one feature. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch || !focusRequest) return
    // One camera move per request. The data this effect reads keeps changing
    // under it — anchoring a vessel rewrites the vessel it was asked to frame —
    // and re-running an already-served request would fly the camera back and
    // re-open its popup long after the operator asked for anything.
    if (handledFocusRef.current === focusRequest.n) return

    // The target may simply not have loaded yet; leave the request unserved so
    // a later render can honour it rather than swallowing it here.
    const served = () => {
      handledFocusRef.current = focusRequest.n
    }

    // Nothing frames anything while a vessel is under way. The request is
    // consumed rather than left pending, or it would fire the instant the ship
    // parks and yank the camera off the arrival it was ordered to show.
    if (transitRef.current) {
      served()
      return
    }

    // A previous alert's popup is stale the moment the camera moves elsewhere.
    focusPopupRef.current?.remove()
    focusPopupRef.current = null

    if (focusRequest.target === 'point') {
      if (!focusRequest.coordinates) return
      served()
      map.flyTo({
        center: focusRequest.coordinates,
        zoom: Math.max(map.getZoom(), 14),
        duration: 800,
      })
    } else if (focusRequest.target === 'vessel') {
      const vessel = vessels?.features.find((v) => v.properties.id === focusRequest.id)
      if (!vessel) return
      served()
      // Close enough to read the hull and its swing circle, but never zoom back
      // out on an operator who has already gone in further than this.
      map.flyTo({
        center: vessel.geometry.coordinates as [number, number],
        zoom: Math.max(map.getZoom(), 14.5),
        duration: 800,
      })
      const p = vessel.properties
      focusPopupRef.current = new Popup({ closeButton: true, offset: 16, className: 'focus-popup' })
        .setLngLat(vessel.geometry.coordinates as [number, number])
        .setHTML(
          `<strong>${esc(p.name)}</strong>` +
            `<span>${esc(VESSEL_LABELS[p.type] ?? p.type)} · ${p.lengthM} × ${p.beamM} m</span>` +
            `<small>IMO ${esc(p.imo)} · ${esc(p.flag)} · ${p.speedKn} kn · ${esc(p.status)}</small>`,
        )
        .addTo(map)
    } else if (focusRequest.target === 'area' || focusRequest.target === 'geofence') {
      const source =
        focusRequest.target === 'area' ? anchorages?.features : geofences?.features
      const feature = source?.find((f) => f.properties.id === focusRequest.id)
      if (!feature) return
      served()

      const [w, s, e, n] = bbox(feature)
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 70, maxZoom: 14, duration: 800 },
      )

      const props = feature.properties as Record<string, unknown>
      const detail =
        focusRequest.target === 'area'
          ? String(props.purpose ?? '')
          : `${String(props.cause ?? '')}${props.area ? ` · Area ${String(props.area)}` : ''}`
      focusPopupRef.current = new Popup({ closeButton: true, offset: 12, className: 'focus-popup' })
        .setLngLat(centroid(feature).geometry.coordinates as [number, number])
        .setHTML(
          `<strong>${esc(String(props.name ?? focusRequest.id))}</strong>` +
            (detail ? `<span>${esc(detail)}</span>` : ''),
        )
        .addTo(map)
    } else if (focusRequest.target === 'anchorage' && anchorages?.features.length) {
      served()
      const [w, s, e, n] = bbox(anchorages)
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 40, duration: 900 },
      )
    } else if (focusRequest.target !== 'anchorage') {
      served()
      map.fitBounds(PORT_BOUNDS, { padding: 50, duration: 900 })
    }
  }, [styleEpoch, focusRequest, anchorages, vessels, geofences])

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

    const collection = {
      anchorages,
      vessels,
      swing: vessels,
      freeSpots: null,
      geofences,
      contours: null,
      soundings: null,
      graticule: null,
      compass: null,
    }[selected.layer]
    const feature = collection?.features.find((f) => f.properties.id === selected.id)
    if (!feature) return
    const [lng, lat] = centroid(feature).geometry.coordinates
    // The highlight above still applies during a move; only the camera is held,
    // because the passage is already framed and must not be panned off it.
    if (!transitRef.current && !map.getBounds().contains([lng, lat])) {
      map.easeTo({ center: [lng, lat], duration: 600 })
    }
  }, [styleEpoch, selected, anchorages, geofences, vessels])

  /* Free spot: click for details, then relocate by dragging. */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch) return

    const dragSource = () => map.getSource(SOURCE_IDS.spotDrag) as GeoJSONSource | undefined
    // Nothing is inspected while a vessel is under way: the spot card describes
    // water that is in the act of being taken, and a click landing on another
    // spot mid-passage must not put a second card over the move.
    const spot = transit
      ? undefined
      : freeSpots.features.find((f) => f.properties.id === selectedSpotId)

    // Nothing selected — tear everything down.
    if (!spot) {
      spotMarkerRef.current?.remove()
      spotMarkerRef.current = null
      spotClosingRef.current = true
      spotPopupRef.current?.remove()
      spotClosingRef.current = false
      spotPopupRef.current = null
      spotIdRef.current = null
      dragSource()?.setData(EMPTY_FC)
      return
    }

    const radiusM = spot.properties.radiusM
    const centre = pointOnFeature(spot).geometry.coordinates as [number, number]

    /** Redraw the ghost circle and re-run the checks in one pass. */
    const drawAt = (lng: number, lat: number) => {
      const verdict = checkSpotAt(
        [lng, lat],
        spot.properties.id,
        radiusM,
        areasRef.current,
        vesselsRef.current,
        freeSpotsRef.current,
        swingFactorRef.current,
        safetyMarginRef.current,
      )
      dragSource()?.setData({
        type: 'FeatureCollection',
        features: [
          {
            ...turfCircle([lng, lat], radiusM / 1000, { units: 'kilometers', steps: 40 }),
            properties: { ok: verdict.ok },
          },
        ],
      } as FeatureCollection)
      spotMarkerRef.current?.getElement().classList.toggle('spot-handle-bad', !verdict.ok)
      // The popup narrates why, live under the cursor.
      spotPopupRef.current?.setDOMContent(buildSpotPopup(spot.properties, [lng, lat], verdict))
      spotPopupRef.current?.setLngLat([lng, lat])
    }

    /** Details card: identity, position, and the relocate / reset controls. */
    function buildSpotPopup(
      props: FreeSpotProps,
      at: [number, number],
      verdict: ReturnType<typeof checkSpotAt> | null,
    ) {
      const box = document.createElement('div')
      box.className = 'spot-popup'

      const title = document.createElement('strong')
      title.textContent = `Free spot ${props.id}`
      const meta = document.createElement('span')
      meta.textContent = `Area ${props.area} · ${Math.round(props.radiusM)} m swing radius`
      const coords = document.createElement('small')
      coords.textContent = `${at[1].toFixed(5)}°N, ${at[0].toFixed(5)}°E`
      box.append(title, meta, coords)

      if (verdict) {
        const status = document.createElement('p')
        status.className = `spot-verdict ${verdict.ok ? 'ok' : 'bad'}`
        status.textContent = verdict.ok
          ? `Clear — inside Area ${verdict.areaCode}`
          : verdict.problems[0]
        box.append(status)
        if (!verdict.ok && verdict.problems.length > 1) {
          const more = document.createElement('small')
          more.textContent = verdict.problems.slice(1).join(' · ')
          box.append(more)
        }
      }

      const actions = document.createElement('div')
      actions.className = 'spot-popup-actions'
      if (!spotStateRef.current.relocating) {
        const relocate = document.createElement('button')
        relocate.type = 'button'
        relocate.className = 'spot-popup-move'
        relocate.textContent = 'Relocate spot'
        relocate.addEventListener('click', () => dispatch(startRelocate()))
        actions.append(relocate)
        if (movedSpotsRef.current[props.id]) {
          const reset = document.createElement('button')
          reset.type = 'button'
          reset.className = 'spot-popup-reset'
          reset.textContent = 'Reset'
          reset.addEventListener('click', () => dispatch(resetSpot(props.id)))
          actions.append(reset)
        }
      } else {
        const done = document.createElement('button')
        done.type = 'button'
        done.className = 'spot-popup-move'
        done.textContent = 'Done'
        done.addEventListener('click', () => dispatch(cancelRelocate()))
        actions.append(done)
      }
      box.append(actions)
      return box
    }

    // Rebuild from scratch whenever the spot or the mode changes — cheap, and
    // it keeps the marker's draggable flag and handlers in step.
    if (spotIdRef.current !== `${spot.properties.id}:${relocating}`) {
      spotMarkerRef.current?.remove()
      spotClosingRef.current = true
      spotPopupRef.current?.remove()
      spotClosingRef.current = false
      spotIdRef.current = `${spot.properties.id}:${relocating}`

      const el = document.createElement('div')
      el.className = `spot-handle${relocating ? ' spot-handle-live' : ''}`
      if (relocating) {
        // A move cross, so it reads as "pick this up" rather than just a dot.
        el.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5' +
          'M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/></svg>'
        el.title = 'Drag to move this spot'
      }
      // draggable stays off — the drag is driven by hand below.
      const marker = new Marker({ element: el }).setLngLat(centre).addTo(map)

      const popup = new Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 26,
        className: 'focus-popup',
      })
        .setLngLat(centre)
        .setDOMContent(buildSpotPopup(spot.properties, centre, null))
        .addTo(map)
      popup.on('close', () => {
        if (!spotClosingRef.current) dispatch(clearSpot())
      })

      /**
       * The drag is driven here rather than through Marker's own `draggable`
       * flag. That flag depends on the map's mousedown landing on the marker
       * element; when anything else swallows it the gesture silently falls
       * through to DragPan and the map pans instead. Taking the pointer
       * ourselves — and switching DragPan off for the duration — makes the
       * behaviour unconditional.
       */
      if (relocating) {
        const beginDrag = (down: Event) => {
          down.preventDefault()
          down.stopPropagation()
          map.dragPan.disable()
          el.classList.add('spot-handle-dragging')

          const onMove = (ev: MapMouseEvent | MapTouchEvent) => {
            marker.setLngLat(ev.lngLat)
            drawAt(ev.lngLat.lng, ev.lngLat.lat)
          }
          const onUp = (ev: MapMouseEvent | MapTouchEvent) => {
            map.off('mousemove', onMove)
            map.off('touchmove', onMove)
            map.dragPan.enable()
            el.classList.remove('spot-handle-dragging')
            dispatch(
              moveSpot({
                id: spot.properties.id,
                coordinates: [
                  Number(ev.lngLat.lng.toFixed(6)),
                  Number(ev.lngLat.lat.toFixed(6)),
                ],
              }),
            )
          }

          map.on('mousemove', onMove)
          map.on('touchmove', onMove)
          map.once('mouseup', onUp)
          map.once('touchend', onUp)
        }

        el.addEventListener('mousedown', beginDrag)
        el.addEventListener('touchstart', beginDrag, { passive: false })
      }

      spotMarkerRef.current = marker
      spotPopupRef.current = popup
    } else {
      spotMarkerRef.current?.setLngLat(centre)
      spotPopupRef.current?.setLngLat(centre)
    }

    if (relocating) {
      drawAt(centre[0], centre[1])
    } else {
      dragSource()?.setData(EMPTY_FC)
      spotPopupRef.current?.setDOMContent(buildSpotPopup(spot.properties, centre, null))
    }
  }, [styleEpoch, selectedSpotId, relocating, freeSpots, transit, dispatch])

  /**
   * Trail behind the followed vessel only. Just the run already made — drawing
   * the rest of the route ahead reads as a course line the vessel is steering,
   * which is not what a replay is showing.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch) return
    const source = map.getSource(SOURCE_IDS.playback) as GeoJSONSource | undefined
    if (!source) return

    const chosen = playbackData?.vessels.find((v) => v.id === playbackVesselId)
    if (!playbackFleet || !chosen) {
      source.setData(EMPTY_FC)
      return
    }

    const upto = indexAt(chosen.track, playbackProgress)
    const run = trackLine(chosen).slice(0, upto + 1)
    source.setData({
      type: 'FeatureCollection',
      features:
        run.length > 1
          ? [{ type: 'Feature', properties: { kind: 'done' }, geometry: { type: 'LineString', coordinates: run } }]
          : [],
    } as FeatureCollection)
  }, [styleEpoch, playbackData, playbackFleet, playbackVesselId, playbackProgress])

  /**
   * Frame the day's movement once on arriving at the replay. Changing the
   * followed vessel afterwards only pans — never widens the view, which would
   * throw away the zoom the operator has chosen.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleEpoch || activeTab !== 'playback') return
    const chosen = playbackData?.vessels.find((v) => v.id === playbackVesselId)
    if (!chosen || fittedTrackRef.current === chosen.id) return

    const first = fittedTrackRef.current === null
    fittedTrackRef.current = chosen.id

    if (first) {
      const lons = chosen.track.map((t) => t.lon)
      const lats = chosen.track.map((t) => t.lat)
      map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 90, maxZoom: 13.2, duration: 700 },
      )
      return
    }

    const fix = sampleAt(chosen.track, playbackProgressRef.current)
    if (fix) {
      map.easeTo({
        center: [fix.lon, fix.lat],
        zoom: Math.max(map.getZoom(), 12.5),
        duration: 600,
      })
    }
  }, [styleEpoch, activeTab, playbackData, playbackVesselId])

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
