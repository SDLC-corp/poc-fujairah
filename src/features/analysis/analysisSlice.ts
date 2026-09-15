import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

/**
 * The clearance the port states between anchored vessels, quoted on the vessel
 * details as operators expect to read it — in miles.
 *
 * It is a stated figure, deliberately not `safetyMarginM`. That one is the
 * slack the swing radius carries in its own arithmetic (LOA x factor + margin)
 * and stays in metres because the geometry does. Making the radius use 0.3 NM
 * instead adds 556 m to every circle and empties the anchorage — the sample
 * fleet drops from 155 vessels to 27, and packing BN places none at all.
 */
export const SAFETY_MARGIN_NM = 0.3

/**
 * The port's rule for how much water a vessel at anchor needs.
 *
 * Three steps, each set on the Anchorage configuration panel:
 *
 *   1. shackles  = round((depth x multiplier + fixedAllowance) / divider)
 *   2. radius    = shackles x shackleLength + LOA          [metres]
 *   3. effective = radius + extraMargin                    [extraMargin in NM]
 *
 * The multiplier is the weather: more cable is veered when it is blowing. The
 * divider and the fixed allowance are the port's own numbers, not arithmetic —
 * they come off the notice, which is why they are configuration rather than
 * constants.
 */
export interface AnchorageConfig {
  /** Section 1: the reference lengths. */
  shackleLengthM: number
  nauticalMileM: number
  /** Section 2: shackles from depth. */
  normalMultiplier: number
  badWeatherMultiplier: number
  fixedAllowanceM: number
  divider: number
  /** Which multiplier is in force right now. */
  weather: 'normal' | 'bad'
  /**
   * Depth the capacity rule is worked at. A live system reads the charted depth
   * at the spot; with one figure for the whole anchorage this is the depth the
   * port plans against.
   */
  designDepthM: number
  /** Section 3: the length used in the radius itself, which the notice rounds. */
  calcShackleLengthM: number
  /** Section 4: discretionary clearance on top, in nautical miles. */
  extraMarginNm: number
}

export const DEFAULT_ANCHORAGE_CONFIG: AnchorageConfig = {
  shackleLengthM: 27.432,
  nauticalMileM: 1852,
  normalMultiplier: 2,
  badWeatherMultiplier: 3,
  fixedAllowanceM: 90,
  divider: 27.5,
  weather: 'normal',
  designDepthM: 25,
  calcShackleLengthM: 27.5,
  /**
   * The notice quotes 0.18 NM. That is 333 m on every circle, and on this fleet
   * it takes the median swing radius from 348 m to 640 m, asks for 78% of the
   * whole anchorage in swing water, and puts 288 pairs of circles into overlap
   * against 48 today — which empties the free-spot grid. Held at 0.02 NM so the
   * console opens on a working anchorage; the field takes the full figure and
   * the panel shows what it costs.
   */
  extraMarginNm: 0.02,
}

/** Whole shackles, as the notice rounds them: 5.09 reads as 5. */
export function shackleCount(config: AnchorageConfig): number {
  const multiplier =
    config.weather === 'bad' ? config.badWeatherMultiplier : config.normalMultiplier
  if (!config.divider) return 0
  return Math.max(0, Math.round((config.designDepthM * multiplier + config.fixedAllowanceM) / config.divider))
}

/**
 * The rule, compiled into the two numbers the rest of the app already works in.
 *
 * `radius = shackles x shackleLength + LOA + extraMargin` is `LOA x 1 + k`, so
 * the factor is 1 and everything that does not depend on the ship folds into
 * the margin. Keeping the pair means every call site that already takes
 * (LOA, factor, margin) is untouched by the rule changing underneath it.
 */
export function compileSwing(config: AnchorageConfig): { factor: number; marginM: number } {
  return {
    factor: 1,
    marginM:
      shackleCount(config) * config.calcShackleLengthM +
      config.extraMarginNm * config.nauticalMileM,
  }
}

interface AnalysisState {
  /** Proximity search radius around the selected vessel, in kilometres. */
  bufferRadiusKm: number
  showBuffer: boolean
  showNearestBerthLine: boolean
  anchorage: AnchorageConfig
  /**
   * Derived from `anchorage` and never set directly — see `compileSwing`. They
   * live in state rather than in a selector because the whole app reads them,
   * and recomputing them in one reducer is cheaper than threading the config
   * through every consumer.
   */
  swingFactor: number
  safetyMarginM: number
}

const initialState: AnalysisState = {
  bufferRadiusKm: 0.6,
  /**
   * Off by default. The buffer is a search radius for the proximity panel, not
   * a property of the vessel — but on by default it drew a second dashed circle
   * around every selection, sitting concentric with the swing circle and
   * reading as if the ship had two safe areas. The swing circle is the water
   * the vessel actually occupies and is the one that belongs on a click; the
   * buffer is switched on from Proximity analysis when it is being used.
   */
  showBuffer: false,
  showNearestBerthLine: true,
  anchorage: DEFAULT_ANCHORAGE_CONFIG,
  swingFactor: compileSwing(DEFAULT_ANCHORAGE_CONFIG).factor,
  safetyMarginM: compileSwing(DEFAULT_ANCHORAGE_CONFIG).marginM,
}

const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    setBufferRadiusKm(state, action: PayloadAction<number>) {
      state.bufferRadiusKm = action.payload
    },
    setShowBuffer(state, action: PayloadAction<boolean>) {
      state.showBuffer = action.payload
    },
    setShowNearestBerthLine(state, action: PayloadAction<boolean>) {
      state.showNearestBerthLine = action.payload
    },
    /**
     * The single way the swing rule changes. Recompiles the derived pair in the
     * same tick, so the map can never be drawing one rule while the panel shows
     * another.
     */
    setAnchorageConfig(state, action: PayloadAction<Partial<AnchorageConfig>>) {
      state.anchorage = { ...state.anchorage, ...action.payload }
      const { factor, marginM } = compileSwing(state.anchorage)
      state.swingFactor = factor
      state.safetyMarginM = marginM
    },
    resetAnchorageConfig(state) {
      state.anchorage = DEFAULT_ANCHORAGE_CONFIG
      const { factor, marginM } = compileSwing(DEFAULT_ANCHORAGE_CONFIG)
      state.swingFactor = factor
      state.safetyMarginM = marginM
    },
  },
})

export const {
  setBufferRadiusKm,
  setShowBuffer,
  setShowNearestBerthLine,
  setAnchorageConfig,
  resetAnchorageConfig,
} = analysisSlice.actions
export default analysisSlice.reducer
