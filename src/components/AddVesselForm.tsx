import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { addVessel } from '../features/portData/portDataSlice'
import { VESSEL_LABELS, VESSEL_TYPES } from '../map/vesselTypes'
import { beamForLength, draftForLength } from '../utils/vesselDims'
import {
  BUNKER_SERVICES,
  CALL_PURPOSES,
  CARGO_KINDS,
  GLOSSARY,
  LARGE_VESSEL_AREAS,
  LARGE_VESSEL_M,
  MARINE_SERVICES,
  PURPOSES_NEEDING_DESTINATION,
  checkServices,
} from '../utils/anchorageRequest'
import type { ServiceOption } from '../utils/anchorageRequest'
import { AREA_COLORS } from '../map/areaColors'
import { FLAG_STATES } from '../utils/flags'
import Icon from './Icon'
import type {
  AnchorageRequest,
  CallPurpose,
  CargoKind,
  RequiredService,
  VesselFeature,
  VesselType,
} from '../types/gis'

/**
 * Vessels wait clear of the declared areas, east of the anchorage. Each new one
 * is stepped north so hand-entered arrivals do not stack on one another.
 */
const WAITING_LON = 56.638
const WAITING_LAT_BASE = 25.15
const WAITING_LAT_STEP = 0.018

type FieldErrors = Partial<Record<keyof FormState, string>>

/**
 * Field caption: the abbreviation, its full form in brackets, the unit, and an
 * info marker carrying the explanation. The tooltip is a native `title` rather
 * than a styled bubble — the form body scrolls, and a positioned tooltip would
 * be clipped at its edges.
 */
function FieldLabel({
  label,
  full,
  unit,
  required,
  tip,
}: {
  label: string
  full?: string
  unit?: string
  required?: boolean
  tip: string
}) {
  return (
    <span className="field-caption">
      {label}
      {full && <span className="field-full"> ({full})</span>}
      {unit && <span className="field-unit"> · {unit}</span>}
      {required && ' *'}
      <span className="field-info" title={tip} aria-label={tip} role="img">
        i
      </span>
    </span>
  )
}

/** Inline message under a field, tied to the input by aria-describedby. */
function FieldError({ name, msg }: { name: string; msg?: string }) {
  if (!msg) return null
  return (
    <span className="field-error" id={`arf-${name}-error`}>
      {msg}
    </span>
  )
}

/** One selectable service — icon, name, and what the agent is actually asking for. */
function ServiceTile({
  option,
  checked,
  onToggle,
}: {
  option: ServiceOption
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className={`service-tile${checked ? ' selected' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="service-icon">
        <Icon name={option.icon} size={16} />
      </span>
      <span className="service-text">
        <span className="service-label">{option.label}</span>
        <span className="service-hint">{option.hint}</span>
      </span>
    </label>
  )
}

interface FormState {
  name: string
  imo: string
  mmsi: string
  callSign: string
  flag: string
  type: VesselType
  lengthM: string
  beamM: string
  draftM: string
  dwt: string
  gt: string
  /** Local wall-clock value from a datetime-local input, e.g. 2026-08-05T14:30. */
  eta: string
  lastPort: string
  nextPort: string
  agent: string
  purpose: CallPurpose
  terminal: string
  berth: string
  spmNumber: string
  cargoType: CargoKind
  cargoName: string
  hazardous: 'yes' | 'no'
  imoClass: string
  quantity: string
  services: RequiredService[]
}

/** `datetime-local` wants local wall-clock time, not an ISO/UTC string. */
function localDateTime(offsetHours = 0): string {
  const d = new Date(Date.now() + offsetHours * 3600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * A function rather than a constant: the default ETA is eight hours out, which
 * has to be recomputed each time the form opens or resets.
 */
const emptyForm = (): FormState => ({
  name: '',
  imo: '',
  mmsi: '',
  callSign: '',
  flag: 'AE',
  type: 'chemicaltanker',
  lengthM: '220',
  beamM: '',
  draftM: '',
  dwt: '',
  gt: '',
  eta: localDateTime(8),
  lastPort: '',
  nextPort: '',
  agent: '',
  purpose: 'waiting-berth',
  terminal: '',
  berth: '',
  spmNumber: '',
  cargoType: 'liquid-bulk',
  cargoName: '',
  hazardous: 'no',
  imoClass: '',
  quantity: '',
  services: [],
})

export default function AddVesselForm() {
  const dispatch = useAppDispatch()
  const vessels = useAppSelector((s) => s.portData.vessels)
  const anchorages = useAppSelector((s) => s.portData.anchorages)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})

  /* Esc closes, matching the other overlays. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  /** Editing a field clears only that field's error, not the whole summary. */
  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  /** Wires id, invalid state and red styling onto one input in a single spread. */
  function field(key: keyof FormState, base = 'text-input') {
    return {
      id: `arf-${key}`,
      className: `${base}${errors[key] ? ' input-error' : ''}`,
      'aria-invalid': errors[key] ? true : undefined,
      'aria-describedby': errors[key] ? `arf-${key}-error` : undefined,
    }
  }

  function toggleService(value: RequiredService) {
    setForm((f) => ({
      ...f,
      services: f.services.includes(value)
        ? f.services.filter((s) => s !== value)
        : [...f.services, value],
    }))
  }

  const lengthM = Number(form.lengthM)
  const needsDestination = PURPOSES_NEEDING_DESTINATION.includes(form.purpose)
  const isLarge = Number.isFinite(lengthM) && lengthM > LARGE_VESSEL_M
  const serviceCheck = checkServices(form.purpose, form.services)
  const errorCount = Object.keys(errors).length

  /**
   * The notice's own wording for each area, straight from the loaded chart data
   * so the form quotes the source rather than a copy of it.
   */
  const purposeText = (codes: string[], fallback: string) => {
    const match = anchorages?.features.find(
      (f) => f.properties.category === 'anchorage' && codes.includes(f.properties.code),
    )
    return match?.properties.purpose ?? fallback
  }
  // Beam and draft are declared, but pre-filled from LOA so the agent has a
  // sensible starting figure rather than a blank box.
  const beamPlaceholder = Number.isFinite(lengthM) && lengthM > 0 ? beamForLength(form.type, lengthM) : 0
  const draftPlaceholder = Number.isFinite(lengthM) && lengthM > 0 ? draftForLength(lengthM) : 0

  /** Every problem at once, keyed by field — not one at a time. */
  function validate(): FieldErrors {
    const e: FieldErrors = {}
    const etaAt = form.eta ? new Date(form.eta) : null

    if (!form.name.trim()) e.name = 'Vessel name is required.'

    if (!form.imo.trim()) e.imo = 'IMO number is required.'
    else if (!/^\d{7}$/.test(form.imo.trim())) e.imo = 'IMO must be exactly 7 digits.'

    if (form.mmsi.trim() && !/^\d{9}$/.test(form.mmsi.trim())) {
      e.mmsi = 'MMSI must be 9 digits.'
    }

    if (!form.lengthM.trim()) e.lengthM = 'LOA is required.'
    else if (!Number.isFinite(lengthM) || lengthM < 20 || lengthM > 450) {
      e.lengthM = 'LOA must be between 20 and 450 m.'
    }

    if (!(Number(form.beamM) || beamPlaceholder)) e.beamM = 'Beam is required.'
    else if (Number(form.beamM) < 0) e.beamM = 'Beam cannot be negative.'

    if (!(Number(form.draftM) || draftPlaceholder)) e.draftM = 'Draft is required.'
    else if (Number(form.draftM) < 0) e.draftM = 'Draft cannot be negative.'

    if (!form.eta) {
      e.eta = 'ETA is required.'
    } else if (!etaAt || Number.isNaN(etaAt.getTime())) {
      e.eta = 'Enter a valid date and time.'
    } else {
      const hoursOut = (etaAt.getTime() - Date.now()) / 3600_000
      if (hoursOut < -24) e.eta = 'ETA is more than a day in the past.'
      else if (hoursOut > 720) e.eta = 'ETA is more than 30 days out.'
    }

    if (!form.agent.trim()) e.agent = 'Shipping agent is required.'
    if (!form.lastPort.trim()) e.lastPort = 'Last port is required.'
    if (!form.nextPort.trim()) e.nextPort = 'Next port is required.'

    if (form.cargoType !== 'none' && !form.cargoName.trim()) {
      e.cargoName = 'Cargo name is required.'
    }

    return e
  }

  function submit(e: FormEvent) {
    e.preventDefault()

    const found = validate()
    if (Object.keys(found).length > 0) {
      setErrors(found)
      // Send the operator straight to the first problem; the modal body scrolls
      // it into view as a side effect of focusing.
      const firstKey = (Object.keys(form) as (keyof FormState)[]).find((k) => found[k])
      if (firstKey) document.getElementById(`arf-${firstKey}`)?.focus()
      return
    }

    const name = form.name.trim()
    const imo = form.imo.trim()
    const beamM = Number(form.beamM) || beamPlaceholder
    const draftM = Number(form.draftM) || draftPlaceholder

    const fleet = vessels?.features ?? []
    const manualCount = fleet.filter((v) => v.properties.id.startsWith('V-M')).length
    const id = `V-M${String(manualCount + 1).padStart(3, '0')}`
    const eta = new Date(form.eta).toISOString()

    const request: AnchorageRequest = {
      mmsi: form.mmsi.trim() || null,
      callSign: form.callSign.trim().toUpperCase() || null,
      dwtT: Number(form.dwt) || null,
      gt: Number(form.gt) || null,
      lastPort: form.lastPort.trim(),
      nextPort: form.nextPort.trim(),
      agent: form.agent.trim(),
      purpose: form.purpose,
      terminal: needsDestination ? form.terminal.trim() || null : null,
      berth: needsDestination ? form.berth.trim() || null : null,
      spmNumber: form.purpose === 'spm' ? form.spmNumber.trim() || null : null,
      cargoType: form.cargoType,
      cargoName: form.cargoType === 'none' ? '' : form.cargoName.trim(),
      hazardous: form.hazardous === 'yes',
      imoClass: form.hazardous === 'yes' ? form.imoClass : null,
      quantityT: Number(form.quantity) || null,
      services: form.services,
      submittedAt: new Date().toISOString(),
    }

    const feature: VesselFeature = {
      type: 'Feature',
      id,
      properties: {
        id,
        name,
        imo,
        type: form.type,
        flag: form.flag.trim().toUpperCase() || 'AE',
        lengthM: Math.round(lengthM),
        beamM: Math.round(beamM),
        draftM: Number(draftM.toFixed(1)),
        speedKn: 0,
        headingDeg: 260,
        status: 'awaiting',
        area: null,
        ata: null,
        etd: null,
        eta,
        request,
      },
      geometry: {
        type: 'Point',
        coordinates: [WAITING_LON, WAITING_LAT_BASE + manualCount * WAITING_LAT_STEP],
      },
    }

    dispatch(addVessel(feature))
    setForm(emptyForm())
    setErrors({})
    setOpen(false)
  }

  return (
    <section className="panel">
      <h2>
        Anchorage request
        <button type="button" className="link-cell" onClick={() => setOpen(true)}>
          New request
        </button>
      </h2>
      <p className="muted">
        File a request for a vessel that is not in the AIS feed — it joins the queue below and is
        matched the same way.
      </p>

      {open && (
        <>
          <button
            type="button"
            className="drawer-scrim"
            aria-label="Close form"
            onClick={() => setOpen(false)}
          />
          <div className="modal" role="dialog" aria-label="Anchorage request form">
            <header className="modal-head">
              <div>
                <h3>Anchorage request form</h3>
                <span className="muted">Fields marked * are required</span>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <form className="modal-body" onSubmit={submit} id="anchorage-request">
              {/* ---------------- vessel information ---------------- */}
              <fieldset className="form-block">
                <legend>Vessel information</legend>
                <div className="form-grid">
                  <label className={`span2${errors.name ? ' has-error' : ''}`}>
                    Vessel name *
                    <input
                      {...field('name')}
                      value={form.name}
                      placeholder="MT Example"
                      onChange={(e) => set('name', e.target.value)}
                    />
                    <FieldError name="name" msg={errors.name} />
                  </label>
                  <label className={errors.imo ? 'has-error' : undefined}>
                    <FieldLabel
                      label="IMO"
                      full="IMO ship identification number"
                      required
                      tip="Seven-digit number assigned by the International Maritime Organization. Fixed to the hull for life — it never changes with owner, name or flag."
                    />
                    <input
                      {...field('imo')}
                      value={form.imo}
                      inputMode="numeric"
                      maxLength={7}
                      placeholder="9108017"
                      onChange={(e) => set('imo', e.target.value.replace(/\D/g, ''))}
                    />
                    <FieldError name="imo" msg={errors.imo} />
                  </label>
                  <label className={errors.mmsi ? 'has-error' : undefined}>
                    <FieldLabel
                      label="MMSI"
                      full="Maritime Mobile Service Identity"
                      tip="Nine-digit radio identity broadcast by AIS and DSC. Tied to the station, so it changes when the vessel re-flags."
                    />
                    <input
                      {...field('mmsi')}
                      value={form.mmsi}
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="470123456"
                      onChange={(e) => set('mmsi', e.target.value.replace(/\D/g, ''))}
                    />
                    <FieldError name="mmsi" msg={errors.mmsi} />
                  </label>
                 
                  <label>
                    <FieldLabel
                      label="Flag state"
                      full="Registry"
                      tip="Country the vessel is registered in. Sets which regulations, surveys and manning rules she sails under."
                    />
                    <select
                      {...field('flag', '')}
                      value={form.flag}
                      onChange={(e) => set('flag', e.target.value)}
                    >
                      {FLAG_STATES.map((f) => (
                        <option key={f.code} value={f.code}>
                          {f.code} — {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="span2">
                    Vessel type *
                    <select
                      value={form.type}
                      onChange={(e) => set('type', e.target.value as VesselType)}
                    >
                      {VESSEL_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {VESSEL_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>

              {/* ---------------- particulars ---------------- */}
              <fieldset className="form-block">
                <legend>Vessel particulars</legend>
                <div className="form-grid">
                  <label className={errors.lengthM ? 'has-error' : undefined}>
                    <FieldLabel
                      label="LOA"
                      full="Length overall"
                      unit="m"
                      required
                      tip="Total hull length, bow to stern. Sets the swing circle and decides which anchorage areas can take the vessel — over 300 m goes to VN or VS."
                    />
                    <input
                      {...field('lengthM')}
                      type="number"
                      min={20}
                      max={450}
                      value={form.lengthM}
                      onChange={(e) => set('lengthM', e.target.value)}
                    />
                    <FieldError name="lengthM" msg={errors.lengthM} />
                  </label>
                  <label className={errors.beamM ? 'has-error' : undefined}>
                    <FieldLabel
                      label="Beam"
                      full="Extreme breadth"
                      unit="m"
                      required
                      tip="Maximum width of the hull at its widest point, measured outside to outside."
                    />
                    <input
                      {...field('beamM')}
                      type="number"
                      min={1}
                      value={form.beamM}
                      placeholder={String(beamPlaceholder)}
                      onChange={(e) => set('beamM', e.target.value)}
                    />
                    <FieldError name="beamM" msg={errors.beamM} />
                  </label>
                  <label className={errors.draftM ? 'has-error' : undefined}>
                    <FieldLabel
                      label="Draft"
                      full="Draught, loaded"
                      unit="m"
                      required
                      tip="Waterline to the lowest point of the hull. Must clear the charted depth with under-keel clearance to spare."
                    />
                    <input
                      {...field('draftM')}
                      type="number"
                      step="0.1"
                      min={1}
                      value={form.draftM}
                      placeholder={String(draftPlaceholder)}
                      onChange={(e) => set('draftM', e.target.value)}
                    />
                    <FieldError name="draftM" msg={errors.draftM} />
                  </label>
                  <label>
                    <FieldLabel
                      label="DWT"
                      full="Deadweight tonnage"
                      unit="t"
                      tip="Total weight the vessel can carry when loaded to her marks — cargo, bunkers, stores, fresh water, crew and ballast."
                    />
                    <input
                      className="text-input"
                      type="number"
                      min={0}
                      value={form.dwt}
                      onChange={(e) => set('dwt', e.target.value)}
                    />
                  </label>
                  <label>
                    <FieldLabel
                      label="GT"
                      full="Gross tonnage"
                      tip="A measure of the vessel's total enclosed volume, not a weight. Drives port dues, manning and survey requirements. Unitless."
                    />
                    <input
                      className="text-input"
                      type="number"
                      min={0}
                      value={form.gt}
                      onChange={(e) => set('gt', e.target.value)}
                    />
                  </label>
                </div>
                <p className="muted hint">
                  Beam and draft default to {beamPlaceholder} m and {draftPlaceholder} m, estimated
                  from LOA — override with the declared figures.
                </p>
              </fieldset>

              {/* ---------------- voyage ---------------- */}
              <fieldset className="form-block">
                <legend>Voyage</legend>
                <div className="form-grid">
                  <label className={errors.eta ? 'has-error' : undefined}>
                    <FieldLabel
                      label="ETA"
                      full="Estimated time of arrival"
                      required
                      tip="Date and time the vessel expects to reach the pilot boarding ground, in local port time. Sets her place in the assignment queue."
                    />
                    <input
                      {...field('eta')}
                      type="datetime-local"
                      value={form.eta}
                      onChange={(e) => set('eta', e.target.value)}
                    />
                    <FieldError name="eta" msg={errors.eta} />
                  </label>
                  <label className={errors.agent ? 'has-error' : undefined}>
                    Shipping agent *
                    <input
                      {...field('agent')}
                      value={form.agent}
                      placeholder="Gulf Marine Services LLC"
                      onChange={(e) => set('agent', e.target.value)}
                    />
                    <FieldError name="agent" msg={errors.agent} />
                  </label>
                  <label className={errors.lastPort ? 'has-error' : undefined}>
                    Last port *
                    <input
                      {...field('lastPort')}
                      value={form.lastPort}
                      placeholder="AEJEA — Jebel Ali"
                      onChange={(e) => set('lastPort', e.target.value)}
                    />
                    <FieldError name="lastPort" msg={errors.lastPort} />
                  </label>
                  <label className={errors.nextPort ? 'has-error' : undefined}>
                    Next port *
                    <input
                      {...field('nextPort')}
                      value={form.nextPort}
                      placeholder="INNSA — Nhava Sheva"
                      onChange={(e) => set('nextPort', e.target.value)}
                    />
                    <FieldError name="nextPort" msg={errors.nextPort} />
                  </label>
                </div>
              </fieldset>

              {/* ---------------- purpose of call ---------------- */}
              <fieldset className="form-block">
                <legend>Purpose of call *</legend>
                <p className="muted hint">
                  Each purpose matches an area designation in Notice to Mariners No. 346 — the
                  chips show where the Harbour Master would direct this vessel.
                </p>
                <div className="purpose-grid">
                  {CALL_PURPOSES.map((option) => (
                    <label
                      key={option.value}
                      className={`purpose-card${form.purpose === option.value ? ' selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="purpose"
                        value={option.value}
                        checked={form.purpose === option.value}
                        onChange={() => set('purpose', option.value)}
                      />
                      <span className="purpose-body">
                        <span className="purpose-top">
                          <span className="purpose-label">{option.label}</span>
                          <span className="purpose-areas">
                          
                          </span>
                        </span>
                        <span className="purpose-note">
                          {purposeText(option.areas, option.blurb)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>

                {isLarge && (
                  <p className="notice-callout">
                    Over {LARGE_VESSEL_M} m LOA — the notice directs this vessel to the large-vessel
                    anchorages{' '}
                    {LARGE_VESSEL_AREAS.map((code) => (
                      <span key={code} className="area-chip area-chip-inline">
                        <span
                          className="area-chip-dot"
                          style={{ background: AREA_COLORS[code] ?? 'var(--navy-500)' }}
                        />
                        {code}
                      </span>
                    ))}{' '}
                    ahead of the areas above.
                  </p>
                )}

                <details className="glossary">
                  <summary>What do these terms mean?</summary>
                  <dl>
                    {GLOSSARY.map((g) => (
                      <div key={g.term}>
                        <dt>{g.term}</dt>
                        <dd>{g.meaning}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </fieldset>

              {/* ---------------- destination ---------------- */}
              {needsDestination && (
                <fieldset className="form-block">
                  <legend>Destination</legend>
                  <div className="form-grid">
                    <label>
                      Terminal
                      <input
                        className="text-input"
                        value={form.terminal}
                        placeholder="Fujairah Oil Terminal"
                        onChange={(e) => set('terminal', e.target.value)}
                      />
                    </label>
                    <label>
                      Berth
                      <input
                        className="text-input"
                        value={form.berth}
                        placeholder="Berth 7"
                        onChange={(e) => set('berth', e.target.value)}
                      />
                    </label>
                    {form.purpose === 'spm' && (
                      <label>
                        SPM number
                        <select
                          value={form.spmNumber}
                          onChange={(e) => set('spmNumber', e.target.value)}
                        >
                          <option value="">—</option>
                          <option value="A">SPM A — Mo(A)Y.15s</option>
                          <option value="B">SPM B — Mo(B)Y.15s</option>
                          <option value="C">SPM C — Mo(C)Y.15s</option>
                        </select>
                      </label>
                    )}
                  </div>
                </fieldset>
              )}

              {/* ---------------- cargo ---------------- */}
              <fieldset className="form-block">
                <legend>Cargo</legend>
                <div className="form-grid">
                  <label>
                    Cargo type *
                    <select
                      value={form.cargoType}
                      onChange={(e) => set('cargoType', e.target.value as CargoKind)}
                    >
                      {CARGO_KINDS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={errors.cargoName ? 'has-error' : undefined}>
                    Cargo name {form.cargoType !== 'none' && '*'}
                    <input
                      {...field('cargoName')}
                      value={form.cargoName}
                      disabled={form.cargoType === 'none'}
                      placeholder="Gas oil"
                      onChange={(e) => set('cargoName', e.target.value)}
                    />
                    <FieldError name="cargoName" msg={errors.cargoName} />
                  </label>
                  <label>
                    Hazardous cargo *
                    <select
                      value={form.hazardous}
                      onChange={(e) => set('hazardous', e.target.value as 'yes' | 'no')}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </label>
                 
                 
                </div>
                {form.hazardous === 'yes' && (
                  <p className="muted hint">
                    Hazardous cargo affects which areas suit this vessel and the separation the
                    harbour master must keep from neighbouring ships.
                  </p>
                )}
              </fieldset>

              {/* ---------------- required services ---------------- */}
              <fieldset className="form-block">
                <legend>
                  Required services
                  {form.services.length > 0 && (
                    <span className="legend-count">{form.services.length} selected</span>
                  )}
                </legend>

                <p className="service-group-head">
                  Bunkering class
                  <span className="muted">
                    named in the notice — these require Area BN or BS
                  </span>
                </p>
                <div className="service-grid">
                  {BUNKER_SERVICES.map((option) => (
                    <ServiceTile
                      key={option.value}
                      option={option}
                      checked={form.services.includes(option.value)}
                      onToggle={() => toggleService(option.value)}
                    />
                  ))}
                </div>

                <p className="service-group-head">
                  Other marine services
                  <span className="muted">permitted in Area C as well as BN / BS</span>
                </p>
                <div className="service-grid">
                  {MARINE_SERVICES.map((option) => (
                    <ServiceTile
                      key={option.value}
                      option={option}
                      checked={form.services.includes(option.value)}
                      onToggle={() => toggleService(option.value)}
                    />
                  ))}
                </div>

                {serviceCheck && (
                  <p
                    className={
                      serviceCheck.tone === 'alert' ? 'override-warning' : 'notice-callout'
                    }
                  >
                    {serviceCheck.message}
                  </p>
                )}

                {form.services.length === 0 && (
                  <p className="muted hint">
                    Leave all unticked if the vessel needs nothing while at anchor.
                  </p>
                )}
              </fieldset>

              {errorCount > 0 && (
                <p className="form-error-summary" role="alert">
                  {errorCount} field{errorCount > 1 ? 's need' : ' needs'} attention — highlighted
                  in red above.
                </p>
              )}
            </form>

            <footer className="modal-foot">
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" form="anchorage-request" className="primary-button">
                Submit request
              </button>
            </footer>
          </div>
        </>
      )}
    </section>
  )
}
