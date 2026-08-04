import { useAppSelector } from '../../app/hooks'
import { selectAnchorBerths, selectAreas } from '../../features/analysis/selectors'
import { AREA_COLORS } from '../../map/areaColors'
import { VESSEL_COLORS, VESSEL_LABELS, VESSEL_TYPES } from '../../map/vesselTypes'
import RawJson from '../RawJson'

/** Reference for everything the map draws: area codes, colours and vessel types. */
export default function InfoScreen() {
  const areas = useAppSelector(selectAreas)
  const berths = useAppSelector(selectAnchorBerths)
  const swingFactor = useAppSelector((s) => s.analysis.swingFactor)
  const safetyMarginM = useAppSelector((s) => s.analysis.safetyMarginM)

  const anchorages = areas.filter((a) => a.properties.category === 'anchorage')
  const other = areas.filter((a) => a.properties.category !== 'anchorage')

  return (
    <>
      <section className="panel">
        <h2>Anchorage codes</h2>
        <p className="muted">
          The {anchorages.length} designated anchorages. The map labels each one with its code, as
          the published chart does.
        </p>
        <table className="data-table info-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Area</th>
              <th>Designated for</th>
            </tr>
          </thead>
          <tbody>
            {anchorages.map((a) => (
              <tr key={a.properties.id}>
                <td>
                  <span
                    className="legend-chip"
                    style={{ background: AREA_COLORS[a.properties.code] ?? '#0369a1' }}
                  >
                    {a.properties.code}
                  </span>
                </td>
                <td>{a.properties.name.replace('Anchorage Area ', 'Area ')}</td>
                <td className="muted">{a.properties.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Other declared areas</h2>
        <table className="data-table info-table">
          <tbody>
            {other.map((a) => (
              <tr key={a.properties.id}>
                <td>
                  <span
                    className="legend-chip"
                    style={{ background: AREA_COLORS[a.properties.code] ?? '#0369a1' }}
                  >
                    {a.properties.code}
                  </span>
                </td>
                <td>{a.properties.name}</td>
                <td className="muted">{a.properties.purpose}</td>
              </tr>
            ))}
            <tr>
              <td>
                <span className="legend-chip" style={{ background: '#0f766e' }}>
                  T
                </span>
              </td>
              <td>Anchor berths ({berths.length})</td>
              <td className="muted">Numbered spots inside Area T</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Vessel colours</h2>
        <p className="muted">AIS category drives the hull colour on the map.</p>
        <ul className="legend-list legend-list-swatch info-swatches">
          {VESSEL_TYPES.map((t) => (
            <li key={t}>
              <span className="legend-swatch-sq" style={{ background: VESSEL_COLORS[t] }} />
              <span className="legend-name">{VESSEL_LABELS[t]}</span>
              <code className="legend-hex">{VESSEL_COLORS[t]}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Swing circles</h2>
        <p className="muted">
          Every vessel carries the water it needs at anchor. The radius is its length times a
          multiplying factor, plus a safety margin so two safe areas never touch.
        </p>
        <p className="result-line">
          radius = LOA × <strong>{swingFactor}</strong> + <strong>{safetyMarginM} m</strong> — a
          200 m vessel needs <strong>{200 * swingFactor + safetyMarginM} m</strong>
        </p>
        <p className="muted hint">
          Both values are editable under Settings → Swing radius parameters. Click any vessel to
          read its radius, diameter and safe area.
        </p>
      </section>

      <section className="panel">
        <h2>Data source</h2>
        <p className="muted">
          Area geometry is transcribed from <strong>Port of Fujairah Notice to Mariners No. 346</strong>
          , “Fujairah Anchorage Area (FAA) — Reorganization”, ref MD/24/013 dated 16 January 2024,
          effective 01 February 2024. Affected charts: Admiralty 3709, 3723, 3708 and 3520.
        </p>
        <p className="muted hint">
          For demonstration only — not for navigation. Work from the current official chart and
          notices.
        </p>
      </section>

      <RawJson
        label="GET /api/reference/areas"
        data={{
          areas: areas.map((a) => ({
            code: a.properties.code,
            name: a.properties.name,
            category: a.properties.category,
            purpose: a.properties.purpose,
            colour: AREA_COLORS[a.properties.code] ?? null,
          })),
          vesselColours: VESSEL_COLORS,
          swing: { factor: swingFactor, safetyMarginM },
        }}
      />
    </>
  )
}
