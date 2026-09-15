import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  resetAnchorageConfig,
  setAnchorageConfig,
  shackleCount,
  type AnchorageConfig,
} from '../features/analysis/analysisSlice'
import { selectFreeSpots } from '../features/analysis/selectors'

/**
 * The port's swing-radius rule, as configuration rather than as constants.
 *
 * Every figure here comes off the notice, and every one of them moves the map:
 * the rule is compiled into the radius the allocator packs spots with, the
 * circles drawn on the chart, and the capacity each area reports. So each
 * section carries a worked example on the numbers as they currently stand —
 * a formula you cannot see the result of is one nobody will touch.
 */

/** LOA the worked example is shown for. Real ones come off the vessel record. */
const EXAMPLE_LOA_M = 200

export default function AnchorageConfigPanel() {
  const dispatch = useAppDispatch()
  const cfg = useAppSelector((s) => s.analysis.anchorage)
  const marginM = useAppSelector((s) => s.analysis.safetyMarginM)
  // The live consequence of the rule: how many spots the allocator can still
  // find once every circle has been sized by it.
  const freeSpots = useAppSelector(selectFreeSpots)

  const set = (patch: Partial<AnchorageConfig>) => dispatch(setAnchorageConfig(patch))
  const num = (v: string, fallback: number) => (v === '' ? fallback : Number(v))

  const shackles = shackleCount(cfg)
  const multiplier = cfg.weather === 'bad' ? cfg.badWeatherMultiplier : cfg.normalMultiplier
  const raw = cfg.divider
    ? (cfg.designDepthM * multiplier + cfg.fixedAllowanceM) / cfg.divider
    : 0

  const cableM = shackles * cfg.calcShackleLengthM
  const radiusM = cableM + EXAMPLE_LOA_M
  const radiusNm = cfg.nauticalMileM ? radiusM / cfg.nauticalMileM : 0
  const effectiveNm = radiusNm + cfg.extraMarginNm
  const effectiveM = Math.round(radiusM + cfg.extraMarginNm * cfg.nauticalMileM)

  return (
    <section className="panel panel-wide">
      <h2>
        Anchorage configuration
        <button
          type="button"
          className="ghost-button head-action"
          onClick={() => dispatch(resetAnchorageConfig())}
        >
          Reset to notice
        </button>
      </h2>
      <p className="muted">
        The rule used to work out how much water a vessel at anchor needs. These figures drive the
        swing circles on the chart, the free-spot grid and every capacity figure in the console.
      </p>

      {/* ---------- 1. shackle settings ---------- */}
      <fieldset className="cfg-block">
        <legend>1 · Shackle settings</legend>
        <div className="cfg-fields">
          <label className="field">
            <span>Length of 1 shackle</span>
            <span className="cfg-unit">
              <input
                className="text-input"
                type="number"
                step={0.001}
                min={0}
                value={cfg.shackleLengthM}
                onChange={(e) => set({ shackleLengthM: num(e.target.value, 0) })}
              />
              <em>m</em>
            </span>
          </label>
          <label className="field">
            {/* Named the same way as the shackle beside it — both fields answer
                "how long is one of these", and only one of them said so. */}
            <span>Length of 1 nautical mile</span>
            <span className="cfg-unit">
              <input
                className="text-input"
                type="number"
                step={1}
                min={1}
                value={cfg.nauticalMileM}
                onChange={(e) => set({ nauticalMileM: num(e.target.value, 1852) })}
              />
              <em>m</em>
            </span>
          </label>
        </div>
        <p className="cfg-example">
          1 shackle = <b>{cfg.shackleLengthM} m</b> · 1 nautical mile = <b>{cfg.nauticalMileM} m</b>
        </p>
        <small className="muted field-note">
          One nautical mile is 1852 m by international definition — a minute of latitude. It is
          editable only because every other figure in this rule is, and the panel should not have
          one number the operator cannot see the provenance of.
          {cfg.nauticalMileM !== 1852 && (
            <>
              {' '}
              <b>Currently {cfg.nauticalMileM} m</b>, which is not the standard figure.{' '}
              <button
                type="button"
                className="link-cell"
                onClick={() => set({ nauticalMileM: 1852 })}
              >
                Put it back to 1852
              </button>
            </>
          )}
        </small>
      </fieldset>

      {/* ---------- 2. shackles from depth ---------- */}
      <fieldset className="cfg-block">
        <legend>2 · Number of shackles, from depth of water</legend>
        <p className="cfg-formula">
          Shackles = ( Depth × <b>{multiplier}</b> + <b>{cfg.fixedAllowanceM}</b> ) ÷{' '}
          <b>{cfg.divider}</b>
        </p>

        <div className="cfg-fields">
          <label className="field">
            <span>Multiplier — normal</span>
            <input
              className="text-input"
              type="number"
              step={0.1}
              min={0}
              value={cfg.normalMultiplier}
              onChange={(e) => set({ normalMultiplier: num(e.target.value, 2) })}
            />
          </label>
          <label className="field">
            <span>Multiplier — bad weather</span>
            <input
              className="text-input"
              type="number"
              step={0.1}
              min={0}
              value={cfg.badWeatherMultiplier}
              onChange={(e) => set({ badWeatherMultiplier: num(e.target.value, 3) })}
            />
          </label>
          <label className="field">
            <span>Fixed allowance</span>
            <span className="cfg-unit">
              <input
                className="text-input"
                type="number"
                step={1}
                min={0}
                value={cfg.fixedAllowanceM}
                onChange={(e) => set({ fixedAllowanceM: num(e.target.value, 90) })}
              />
              <em>m</em>
            </span>
          </label>
          <label className="field">
            <span>Divider</span>
            <input
              className="text-input"
              type="number"
              step={0.1}
              min={0.1}
              value={cfg.divider}
              onChange={(e) => set({ divider: num(e.target.value, 27.5) })}
            />
          </label>
          <label className="field">
            <span>Design depth of water</span>
            <span className="cfg-unit">
              <input
                className="text-input"
                type="number"
                step={0.5}
                min={0}
                value={cfg.designDepthM}
                onChange={(e) => set({ designDepthM: num(e.target.value, 25) })}
              />
              <em>m</em>
            </span>
          </label>
          <div className="field">
            <span>Weather in force</span>
            <div className="radio-row">
              <label>
                <input
                  type="radio"
                  checked={cfg.weather === 'normal'}
                  onChange={() => set({ weather: 'normal' })}
                />{' '}
                Normal
              </label>
              <label>
                <input
                  type="radio"
                  checked={cfg.weather === 'bad'}
                  onChange={() => set({ weather: 'bad' })}
                />{' '}
                Bad weather
              </label>
            </div>
          </div>
        </div>

        <p className="cfg-example">
          At {cfg.designDepthM} m: ( {cfg.designDepthM} × {multiplier} + {cfg.fixedAllowanceM} ) ÷{' '}
          {cfg.divider} = {raw.toFixed(2)} ≈ <b>{shackles} shackles</b>
        </p>
        <small className="muted field-note">
          Rounded to whole shackles, as the notice quotes them. Depth is one figure for the whole
          anchorage here; a live system would read the charted depth at the spot.
        </small>
      </fieldset>

      {/* ---------- 3. swing radius ---------- */}
      <fieldset className="cfg-block">
        <legend>3 · Swing radius</legend>
        <p className="cfg-formula">
          Swing radius (NM) = ( Shackles × <b>{cfg.calcShackleLengthM}</b> + LOA ) ÷{' '}
          <b>{cfg.nauticalMileM}</b>
        </p>

        <div className="cfg-fields">
          <label className="field">
            <span>Shackle length used in the radius</span>
            <span className="cfg-unit">
              <input
                className="text-input"
                type="number"
                step={0.1}
                min={0}
                value={cfg.calcShackleLengthM}
                onChange={(e) => set({ calcShackleLengthM: num(e.target.value, 27.5) })}
              />
              <em>m</em>
            </span>
          </label>
        </div>

        <p className="cfg-example">
          {shackles} × {cfg.calcShackleLengthM} + {EXAMPLE_LOA_M} = {cableM.toFixed(1)} +{' '}
          {EXAMPLE_LOA_M} = <b>{radiusM.toFixed(1)} m</b> = <b>{radiusNm.toFixed(3)} NM</b>
        </p>
        <small className="muted field-note">
          Shown for a {EXAMPLE_LOA_M} m vessel. LOA is taken from the vessel record in the real
          calculation.
        </small>
      </fieldset>

      {/* ---------- 4. extra margin ---------- */}
      <fieldset className="cfg-block">
        <legend>4 · Extra margin</legend>
        <div className="cfg-fields">
          <label className="field">
            <span>Extra margin</span>
            <span className="cfg-unit">
              <input
                className="text-input"
                type="number"
                step={0.01}
                min={0}
                max={0.5}
                value={cfg.extraMarginNm}
                onChange={(e) => set({ extraMarginNm: num(e.target.value, 0) })}
              />
              <em>NM</em>
            </span>
          </label>
        </div>
        <p className="cfg-example">
          Effective swing radius = {radiusNm.toFixed(3)} + {cfg.extraMarginNm} ={' '}
          <b>{effectiveNm.toFixed(3)} NM</b> ({effectiveM} m for a {EXAMPLE_LOA_M} m vessel)
        </p>
        <small className="muted field-note">
          Clearance added on top so two safe areas never touch. The notice quotes 0.18 NM — that is{' '}
          {Math.round(0.18 * cfg.nauticalMileM)} m on every circle, which on this sample fleet
          leaves the allocator almost nowhere to put anybody. Watch the spot count below as you
          change it.
        </small>
      </fieldset>

      <p className="cfg-outcome">
        <span>
          Compiled rule: radius = LOA + <b>{Math.round(marginM)} m</b>
        </span>
        <span className={freeSpots.features.length === 0 ? 'is-alert' : undefined}>
          Free spots the allocator can find right now: <b>{freeSpots.features.length}</b>
        </span>
      </p>
    </section>
  )
}
