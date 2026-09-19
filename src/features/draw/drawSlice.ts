import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

/**
 * The geometry being drawn, while it is being drawn.
 *
 * Its own slice rather than screen state, because two things that are not the
 * screen need it: the map has to draw the shape and report clicks into it, and
 * the map is mounted by the layout rather than by the form. A draft held in a
 * component would have to be threaded through both.
 *
 * Nothing here knows it is an incident. It is a polygon or a circle and a way
 * of building one, which is the same job for an anchorage area, a geofence or
 * anything else the port may want to draw later.
 */

export type DrawShape = 'polygon' | 'circle'
/** Clicked onto the chart, or typed as coordinates. */
export type DrawMethod = 'map' | 'manual'

/** Guards against a stray drag being read as a hundred-vertex polygon. */
export const MAX_POINTS = 60
export const MIN_RADIUS_M = 25
export const MAX_RADIUS_M = 5000

interface DrawState {
  /** True while a drawing session is open — the map reads this to take clicks. */
  active: boolean
  method: DrawMethod
  shape: DrawShape
  /** Polygon vertices, or a single centre when the shape is a circle. */
  points: [number, number][]
  radiusM: number
  /**
   * Whether the radius has been settled.
   *
   * A circle is drawn in two clicks — centre, then a point on the rim — and
   * between them the radius follows the cursor. This is what says which of
   * those two states the map is in; without it a centre with a default radius
   * looks identical to a finished circle.
   */
  radiusFixed: boolean
  /**
   * The shape is finished and the chart has stopped taking corners.
   *
   * A polygon has no natural end — there is always room for another corner —
   * so it needs one said out loud. Without it every click after the shape was
   * right added a corner to it, and an operator who had finished had no way to
   * put the mouse down.
   *
   * A circle does not use this: its second click settles it, which is what
   * `radiusFixed` already means.
   */
  complete: boolean
  /** Where the cursor is, for the coordinate readout and the rubber band. */
  hover: [number, number] | null
}

const initialState: DrawState = {
  active: false,
  method: 'map',
  shape: 'polygon',
  points: [],
  radiusM: 400,
  radiusFixed: false,
  complete: false,
  hover: null,
}

/** A polygon encloses nothing below this, so it cannot be finished below it. */
export const MIN_POLYGON_POINTS = 3

const drawSlice = createSlice({
  name: 'draw',
  initialState,
  reducers: {
    /** Open a session, empty. Leaves the last shape choice alone. */
    startDraw(state, action: PayloadAction<DrawShape | undefined>) {
      state.active = true
      state.shape = action.payload ?? state.shape
      state.points = []
      state.radiusFixed = false
      state.complete = false
      state.hover = null
    },
    endDraw(state) {
      state.active = false
      state.points = []
      state.radiusFixed = false
      state.complete = false
      state.hover = null
    },

    /**
     * Done. The chart stops taking corners until the operator says otherwise.
     *
     * Refused below three corners rather than accepted and left broken: a
     * "finished" shape that encloses nothing would pass every later step and
     * fail at the end, which is the worst moment to find out.
     */
    completeShape(state) {
      if (state.shape === 'circle') return
      if (state.points.length < MIN_POLYGON_POINTS) return
      state.complete = true
      // The rubber band belongs to an unfinished shape.
      state.hover = null
    },

    /** Take corners again — how an operator adds one they missed. */
    resumeDraw(state) {
      state.complete = false
    },
    setMethod(state, action: PayloadAction<DrawMethod>) {
      state.method = action.payload
    },
    /**
     * Change shape, and drop what was drawn with the other one.
     *
     * Kept rather than converted: three polygon corners are not a circle, and
     * guessing which circle they meant would be inventing geometry the operator
     * did not draw.
     */
    setShape(state, action: PayloadAction<DrawShape>) {
      if (state.shape === action.payload) return
      state.shape = action.payload
      state.points = []
      state.radiusFixed = false
      state.complete = false
    },

    /**
     * A click on the chart.
     *
     * What it means depends on the shape and on how far in the drawing is: a
     * polygon takes vertices until it is told to stop, while a circle takes a
     * centre and then one point on its rim, after which further clicks do
     * nothing — a third click on a finished circle is a misclick, not a request
     * to start again.
     */
    addPoint(state, action: PayloadAction<{ at: [number, number]; distanceM?: number }>) {
      if (!state.active || state.complete) return
      const { at, distanceM } = action.payload

      if (state.shape === 'circle') {
        if (state.points.length === 0) {
          state.points = [at]
          state.radiusFixed = false
        } else if (!state.radiusFixed && distanceM != null) {
          state.radiusM = Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(distanceM)))
          state.radiusFixed = true
        }
        return
      }

      if (state.points.length >= MAX_POINTS) return
      state.points.push(at)
    },

    removePoint(state, action: PayloadAction<number>) {
      state.points.splice(action.payload, 1)
      // Losing the centre loses the circle, radius included.
      if (state.shape === 'circle' && state.points.length === 0) state.radiusFixed = false
      // Dropping below three corners un-finishes it: there is nothing enclosed
      // to have finished, and leaving it "complete" would refuse the click that
      // fixes it.
      if (state.points.length < MIN_POLYGON_POINTS) state.complete = false
    },

    /** Move one vertex, for an edit typed into the coordinate table. */
    movePoint(state, action: PayloadAction<{ index: number; at: [number, number] }>) {
      const { index, at } = action.payload
      if (index >= 0 && index < state.points.length) state.points[index] = at
    },

    /** Replace the lot — how the pasted-coordinates box commits. */
    setPoints(state, action: PayloadAction<[number, number][]>) {
      state.points = action.payload.slice(0, MAX_POINTS)
    },

    clearPoints(state) {
      state.points = []
      state.radiusFixed = false
      state.complete = false
    },

    setRadius(state, action: PayloadAction<number>) {
      state.radiusM = Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(action.payload)))
      state.radiusFixed = true
    },

    setHover(state, action: PayloadAction<[number, number] | null>) {
      state.hover = action.payload
    },
  },
})

export const {
  startDraw,
  endDraw,
  completeShape,
  resumeDraw,
  setMethod,
  setShape,
  addPoint,
  removePoint,
  movePoint,
  setPoints,
  clearPoints,
  setRadius,
  setHover,
} = drawSlice.actions
export default drawSlice.reducer
