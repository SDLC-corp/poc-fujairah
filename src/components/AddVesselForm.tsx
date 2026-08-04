import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { addVessel } from '../features/portData/portDataSlice'
import { VESSEL_LABELS, VESSEL_TYPES } from '../map/vesselTypes'
import { beamForLength, draftForLength } from '../utils/vesselDims'
import type { VesselFeature, VesselType } from '../types/gis'

/**
 * Vessels wait clear of the declared areas, east of the anchorage. Each new one
 * is stepped north so hand-entered arrivals do not stack on one another.
 */
const WAITING_LON = 56.638
const WAITING_LAT_BASE = 25.15
const WAITING_LAT_STEP = 0.018

export default function AddVesselForm() {
  const dispatch = useAppDispatch()
  const vessels = useAppSelector((s) => s.portData.vessels)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<VesselType>('chemicaltanker')
  const [lengthM, setLengthM] = useState(220)
  const [flag, setFlag] = useState('AE')
  const [etaHours, setEtaHours] = useState(8)
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the vessel a name.')
      return
    }
    if (!Number.isFinite(lengthM) || lengthM < 20 || lengthM > 450) {
      setError('Length overall must be between 20 and 450 m.')
      return
    }

    const fleet = vessels?.features ?? []
    const manualCount = fleet.filter((v) => v.properties.id.startsWith('V-M')).length
    const id = `V-M${String(manualCount + 1).padStart(3, '0')}`
    const eta = new Date(Date.now() + etaHours * 3600_000).toISOString()

    const feature: VesselFeature = {
      type: 'Feature',
      id,
      properties: {
        id,
        name: trimmed,
        imo: `MANUAL-${manualCount + 1}`,
        type,
        flag: flag.trim().toUpperCase() || 'AE',
        lengthM: Math.round(lengthM),
        beamM: beamForLength(type, lengthM),
        draftM: draftForLength(lengthM),
        speedKn: 0,
        headingDeg: 260,
        status: 'awaiting',
        area: null,
        ata: null,
        etd: null,
        eta,
      },
      geometry: {
        type: 'Point',
        coordinates: [WAITING_LON, WAITING_LAT_BASE + manualCount * WAITING_LAT_STEP],
      },
    }

    dispatch(addVessel(feature))
    setError(null)
    setName('')
    setOpen(false)
  }

  return (
    <section className="panel">
      <h2>
        Add vessel manually
        <button type="button" className="link-cell" onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'New arrival'}
        </button>
      </h2>

      {!open ? (
        <p className="muted">
          Enter a vessel that is not in the AIS feed — it joins the queue below and is matched the
          same way.
        </p>
      ) : (
        <>
          <div className="form-row form-row-stack">
            <label>
              Vessel name
              <input
                className="text-input"
                value={name}
                placeholder="MT Example"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Type
              <select value={type} onChange={(e) => setType(e.target.value as VesselType)}>
                {VESSEL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {VESSEL_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Flag
              <input
                className="text-input"
                value={flag}
                maxLength={2}
                onChange={(e) => setFlag(e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Length overall (m)
              <input
                className="text-input"
                type="number"
                min={20}
                max={450}
                value={lengthM}
                onChange={(e) => setLengthM(Number(e.target.value))}
              />
            </label>
            <label>
              ETA (hours from now)
              <input
                className="text-input"
                type="number"
                min={0}
                max={168}
                value={etaHours}
                onChange={(e) => setEtaHours(Number(e.target.value))}
              />
            </label>
          </div>

          <p className="muted hint">
            Beam {beamForLength(type, lengthM)} m and draft {draftForLength(lengthM)} m are derived
            from the length; the vessel is placed in the waiting area east of the anchorage.
          </p>
          {error && <p className="override-warning">{error}</p>}

          <button type="button" className="primary-button" onClick={submit}>
            Add to queue
          </button>
        </>
      )}
    </section>
  )
}
