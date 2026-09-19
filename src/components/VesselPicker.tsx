import { useEffect, useMemo, useRef, useState } from 'react'
import { FiChevronDown, FiSearch } from 'react-icons/fi'
import type { VesselFeature } from '../types/gis'
import { VESSEL_LABELS } from '../map/vesselTypes'
import type { VesselType } from '../types/gis'

/**
 * Picks the vessels an incident involves — none, one, or several.
 *
 * Multi-select and optional, because both cases are real: a slick is reported
 * before anybody knows which ship it came off, and a proximity event is about a
 * pair where naming one makes the other look uninvolved.
 *
 * A searchable dropdown rather than a long native `<select multiple>`: the
 * anchorage holds several hundred ships, ctrl-clicking through a scrolling box
 * is how the wrong one gets picked, and the operator usually knows the name
 * they are looking for. Each row carries her area and IMO, so two ships with
 * similar names can be told apart before one is chosen.
 *
 * It borrows the flag filter's dropdown shell — same widget, same behaviour, so
 * the two multi-selects in this console cannot look or act like different
 * things.
 */
export default function VesselPicker({
  fleet,
  selected,
  onChange,
}: {
  fleet: VesselFeature[]
  /** Vessel ids. */
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  /* Click-away and Escape, the two ways out of any dropdown. */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return fleet
    return fleet.filter((v) => {
      const p = v.properties
      return (
        p.name.toLowerCase().includes(q) ||
        String(p.imo).includes(q) ||
        (p.area ?? '').toLowerCase().includes(q)
      )
    })
  }, [fleet, query])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id])

  const chosen = fleet.filter((v) => selected.includes(v.properties.id))

  return (
    <div className="flag-filter multi-picker" ref={rootRef}>
      <button
        type="button"
        className="flag-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flag-trigger-text">
          {/* "No vessel named" rather than "None": the first says a choice was
              made and is valid, the second reads like an empty field. */}
          {chosen.length === 0
            ? 'No vessel named'
            : chosen.length === 1
              ? chosen[0].properties.name
              : `${chosen.length} vessels`}
        </span>
        <FiChevronDown size={14} />
      </button>

      {open && (
        <div className="flag-menu" role="listbox" aria-label="Vessels involved">
          <label className="flag-search">
            <FiSearch size={14} />
            <input
              className="text-input"
              type="search"
              autoFocus
              placeholder="Search name, IMO or area…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <ul className="flag-list">
            {shown.map((v) => {
              const p = v.properties
              const on = selected.includes(p.id)
              return (
                <li key={p.id} className={on ? 'is-on' : undefined}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(p.id)}
                      aria-label={p.name}
                    />
                    <span className="flag-name">{p.name}</span>
                    <span className="flag-abbr">
                      {VESSEL_LABELS[p.type as VesselType] ?? p.type}
                    </span>
                    <span className="flag-count">{p.area ? `Area ${p.area}` : '—'}</span>
                  </label>
                </li>
              )
            })}
            {shown.length === 0 && (
              <li className="muted flag-empty">
                {fleet.length === 0 ? 'No vessels loaded.' : 'No vessel matches.'}
              </li>
            )}
          </ul>

          <div className="flag-foot">
            <span className="muted">
              {selected.length === 0 ? 'Optional — none named' : `${selected.length} selected`}
            </span>
            <span className="flag-bulk">
              <button
                type="button"
                className="link-cell"
                disabled={selected.length === 0}
                onClick={() => onChange([])}
              >
                Clear
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
