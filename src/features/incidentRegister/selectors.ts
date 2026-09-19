import { createSelector } from '@reduxjs/toolkit'
import { centroid, circle as turfCircle } from '@turf/turf'
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson'
import type { RootState } from '../../app/store'
import type { Incident, IncidentSeverity, IncidentStatus } from '../../types/incident'
import { SEVERITY_ORDER } from './registerSlice'

const selectAll = (s: RootState) => s.incidentRegister.incidents
const selectApplied = (s: RootState) => s.incidentRegister.applied
const selectPage = (s: RootState) => s.incidentRegister.page
const selectPageSize = (s: RootState) => s.incidentRegister.pageSize

const DAY_MS = 86_400_000

/**
 * The register cut down to the filters in force.
 *
 * Dates are read as UTC and the closing day is inclusive — an operator asking
 * for the 26th means the whole of the 26th, not midnight at the start of it.
 * That off-by-a-day is the single most common way a date-filtered report comes
 * back missing its newest row.
 */
export const selectFilteredIncidents = createSelector(
  [selectAll, selectApplied],
  (incidents, f): Incident[] => {
    const fromMs = f.from ? Date.parse(`${f.from}T00:00:00Z`) : null
    const toMs = f.to ? Date.parse(`${f.to}T00:00:00Z`) + DAY_MS - 1 : null
    const q = f.query.trim().toLowerCase()

    return incidents.filter((i) => {
      if (f.severity !== 'all' && i.severity !== f.severity) return false
      if (f.status !== 'all' && i.status !== f.status) return false
      if (f.type !== 'all' && i.type !== f.type) return false
      if (f.area !== 'all' && i.area !== f.area) return false
      if (fromMs != null || toMs != null) {
        const at = Date.parse(i.occurredAt)
        if (Number.isNaN(at)) return false
        if (fromMs != null && at < fromMs) return false
        if (toMs != null && at > toMs) return false
      }
      if (q) {
        // Every named vessel, so searching a ship finds the incident whether
        // she is the only one on it or one of two.
        const hay =
          `${i.id} ${i.vessels.map((v) => v.name).join(' ')} ${i.typeLabel} ${i.description} ${i.area}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  },
)

export interface IncidentTotals {
  total: number
  byStatus: Record<IncidentStatus, number>
  bySeverity: Record<IncidentSeverity, number>
  /** Open only — a resolved high-severity incident is not a thing to act on. */
  openHigh: number
  thisWeek: number
  resolvedThisMonth: number
}

/**
 * The figures the cards across the top report.
 *
 * Counted over the *whole* register rather than the filtered set, and that is
 * deliberate: they are the standing state of the anchorage, and a card reading
 * "Open incidents 1" because the operator happened to filter to one vessel
 * would be answering a question nobody asked. The table below is the filtered
 * view; these are the context it sits in.
 */
export const selectIncidentTotals = createSelector([selectAll], (incidents): IncidentTotals => {
  const byStatus: Record<IncidentStatus, number> = { open: 0, resolved: 0, closed: 0 }
  const bySeverity: Record<IncidentSeverity, number> = { high: 0, medium: 0, low: 0 }
  let openHigh = 0
  let thisWeek = 0
  let resolvedThisMonth = 0

  // Measured from the newest record rather than from the wall clock: this is
  // generated data with a fixed demo date, and "this week" counted against
  // today would be empty for ever after the first week.
  const newest = incidents.reduce(
    (max, i) => Math.max(max, Date.parse(i.occurredAt) || 0),
    0,
  )
  const weekAgo = newest - 7 * DAY_MS
  const monthAgo = newest - 30 * DAY_MS

  for (const i of incidents) {
    byStatus[i.status] += 1
    bySeverity[i.severity] += 1
    if (i.status === 'open' && i.severity === 'high') openHigh += 1
    const at = Date.parse(i.occurredAt)
    if (at >= weekAgo) thisWeek += 1
    if (at >= monthAgo && i.status !== 'open') resolvedThisMonth += 1
  }

  return { total: incidents.length, byStatus, bySeverity, openHigh, thisWeek, resolvedThisMonth }
})

/**
 * The donut's slices: severity for the open ones, plus everything dealt with.
 *
 * Four slices rather than three, because "how bad are the open ones" and "how
 * many are done" are the two questions a watch supervisor has, and a chart that
 * answered only the first would make a quiet register look as busy as a bad
 * one. Closed and resolved are pooled: from this distance they are both "not
 * mine to worry about".
 */
export const selectSeverityBreakdown = createSelector(
  [selectAll],
  (incidents): { key: string; label: string; value: number; tone: string }[] => {
    const open = incidents.filter((i) => i.status === 'open')
    const done = incidents.length - open.length
    return [
      ...SEVERITY_ORDER.map((s) => ({
        key: s,
        label: s === 'high' ? 'High' : s === 'medium' ? 'Medium' : 'Low',
        value: open.filter((i) => i.severity === s).length,
        tone: s === 'high' ? 'alert' : s === 'medium' ? 'warn' : 'low',
      })),
      { key: 'done', label: 'Closed', value: done, tone: 'ok' },
    ]
  },
)

/**
 * Every area code the register mentions, so the filter offers only real ones.
 *
 * Empties dropped: an incident may be filed with no area, and a blank entry in
 * the dropdown is an option nobody can read and nobody meant to offer.
 */
export const selectIncidentAreas = createSelector([selectAll], (incidents) =>
  [...new Set(incidents.map((i) => i.area).filter(Boolean))].sort(),
)

export interface IncidentPage {
  rows: Incident[]
  page: number
  pages: number
  /** 1-based, for "showing 1 to 10 of 50". */
  firstRow: number
  lastRow: number
  total: number
}

/**
 * One page of the filtered register.
 *
 * The page number is held back inside range here rather than being corrected in
 * the reducer: filters change the result size, and a page that has gone past
 * the end should show the last page instead of an empty table. Clamping at the
 * point of use means no action has to remember to fix it.
 */
export const selectIncidentPage = createSelector(
  [selectFilteredIncidents, selectPage, selectPageSize],
  (rows, page, size): IncidentPage => {
    const pages = Math.max(1, Math.ceil(rows.length / size))
    const current = Math.min(Math.max(1, page), pages)
    const start = (current - 1) * size
    return {
      rows: rows.slice(start, start + size),
      page: current,
      pages,
      firstRow: rows.length === 0 ? 0 : start + 1,
      lastRow: Math.min(start + size, rows.length),
      total: rows.length,
    }
  },
)

/**
 * Where to point the camera for an incident.
 *
 * A circle gives its centre. A polygon gives the mean of its corners *after
 * dropping the closing repeat* — the last point repeats the first, so an
 * unweighted mean over the raw ring double-counts that corner and pulls the
 * camera towards it.
 *
 * Here rather than in either screen because the list and the details page both
 * fly to an incident, and two of these would eventually frame it two ways.
 */
export function incidentCentre(incident: Incident | null): [number, number] | null {
  if (!incident) return null
  const g = incident.geometry
  if (g.kind === 'circle') return g.centre

  const ring = g.coordinates
  const closed =
    ring.length > 2 && ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1]
  const pts = closed ? ring.slice(0, -1) : ring
  if (!pts.length) return null
  return [
    pts.reduce((a, p) => a + p[0], 0) / pts.length,
    pts.reduce((a, p) => a + p[1], 0) / pts.length,
  ]
}

/**
 * The register's geometry for the chart.
 *
 * Built from the *filtered* set, not the whole register: the map sits beside the
 * list and the two have to be showing the same thing. Filtering the table to one
 * area and leaving fifty marks on the water would make the map a decoration.
 *
 * Each incident contributes two features — the affected water, and a point at
 * the middle of it. The point exists because at anchorage-wide zoom a 300 m
 * circle is a few pixels across and a register of them would be invisible; the
 * mark is what makes an incident findable, and the polygon is what makes it
 * legible once found.
 */
export const selectIncidentGeoJson = createSelector(
  [selectFilteredIncidents],
  (incidents): FeatureCollection => {
    const features: Feature[] = []

    for (const i of incidents) {
      const props = {
        id: i.id,
        severity: i.severity,
        status: i.status,
        type: i.typeLabel,
        // A joined string rather than an array: MapLibre feature properties are
        // flat values, and an array would arrive at the style as `[object
        // Object]` rather than as anything a label could show.
        vessels: i.vessels.map((v) => v.name).join(', '),
      }

      let ring: [number, number][]
      let at: [number, number]

      if (i.geometry.kind === 'circle') {
        at = i.geometry.centre
        // The stored ring if the generator wrote one, otherwise worked out here.
        // Either way the centre and radius stay the authored figures — the ring
        // is a drawing of them, never a second copy to be trusted over them.
        ring =
          i.geometry.ring ??
          (turfCircle(i.geometry.centre, i.geometry.radiusM / 1000, {
            units: 'kilometers',
            steps: 48,
          }).geometry.coordinates[0] as [number, number][])
      } else {
        ring = i.geometry.coordinates
        const c = centroid({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [ring] },
        })
        at = c.geometry.coordinates as [number, number]
      }

      features.push({
        type: 'Feature',
        id: i.id,
        properties: props,
        geometry: { type: 'Polygon', coordinates: [ring] } as Polygon,
      })
      features.push({
        // The two share an id so `feature-state` lights the water and its mark
        // together — selecting an incident should not highlight half of it.
        type: 'Feature',
        id: i.id,
        properties: props,
        geometry: { type: 'Point', coordinates: at } as Point,
      })
    }

    return { type: 'FeatureCollection', features }
  },
)

/** The record the details page is on, or the newest when nothing is chosen. */
export const selectSelectedIncident = createSelector(
  [selectAll, (s: RootState) => s.incidentRegister.selectedId],
  (incidents, id): Incident | null =>
    incidents.find((i) => i.id === id) ?? incidents[0] ?? null,
)
