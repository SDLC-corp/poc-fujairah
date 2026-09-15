import { useEffect, useMemo, useRef, useState } from 'react'
import { FiChevronDown, FiSearch } from 'react-icons/fi'
import FlagIcon from './FlagIcon'

export interface FlagOption {
  code: string
  name: string
  /** Vessels wearing this flag in the fleet the report is drawn from. */
  count: number
}

/**
 * Picks the flag states a report covers.
 *
 * A dropdown rather than the row of code chips it replaces. Codes are the wrong
 * thing to make somebody choose from: "MH" and "MT" are one letter apart and
 * mean Marshall Islands and Malta, two of the largest registries calling here,
 * so a row of them is read slowly and mis-clicked easily. The list names the
 * country, shows its ensign, and says how many vessels are wearing it — so the
 * operator knows what a selection will return before making it.
 *
 * Ordered by count, because the report is about what is in the anchorage rather
 * than about the alphabet.
 */
export default function FlagFilter({
  options,
  selected,
  onChange,
}: {
  options: FlagOption[]
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
    if (!q) return options
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q),
    )
  }, [options, query])

  const toggle = (code: string) =>
    onChange(
      selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code],
    )

  /**
   * The trigger carries the answer, not just the question — but only when there
   * is one. Nothing selected means no constraint, and showing a few ensigns for
   * that would look exactly like a selection of those few.
   */
  const shownFlags =
    selected.length === 0 ? [] : options.filter((o) => selected.includes(o.code)).slice(0, 3)

  return (
    <div className="flag-filter" ref={rootRef}>
      <button
        type="button"
        className="flag-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        {shownFlags.length > 0 && (
          <span className="flag-trigger-flags" aria-hidden="true">
            {shownFlags.map((o) => (
              <FlagIcon key={o.code} code={o.code} size={13} />
            ))}
            {selected.length > shownFlags.length && (
              <em className="flag-trigger-more">+{selected.length - shownFlags.length}</em>
            )}
          </span>
        )}
        <span className="flag-trigger-text">
          {selected.length === 0
            ? `All flags (${options.length})`
            : selected.length === 1
              ? (options.find((o) => o.code === selected[0])?.name ?? selected[0])
              : `${selected.length} flag states`}
        </span>
        <FiChevronDown size={14} />
      </button>

      {open && (
        <div className="flag-menu" role="listbox" aria-label="Flag states">
          <label className="flag-search">
            <FiSearch size={14} />
            <input
              className="text-input"
              type="search"
              autoFocus
              placeholder="Search country or code…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <ul className="flag-list">
            {shown.map((o) => {
              const on = selected.includes(o.code)
              return (
                <li key={o.code} className={on ? 'is-on' : undefined}>
                  <label>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(o.code)}
                      aria-label={o.name}
                    />
                    <FlagIcon code={o.code} size={14} />
                    <span className="flag-name">{o.name}</span>
                    <span className="flag-abbr">{o.code}</span>
                    <span className="flag-count">{o.count}</span>
                  </label>
                </li>
              )
            })}
            {shown.length === 0 && (
              <li className="muted flag-empty">
                {options.length === 0 ? 'No vessels loaded.' : 'No country matches.'}
              </li>
            )}
          </ul>

          <div className="flag-foot">
            <span className="muted">
              {selected.length === 0 ? 'No filter — all flags' : `${selected.length} selected`}
            </span>
            <span className="flag-bulk">
              <button
                type="button"
                className="link-cell"
                disabled={shown.length === 0}
                onClick={() => onChange([...new Set([...selected, ...shown.map((o) => o.code)])])}
              >
                {query ? 'Select matches' : 'Select all'}
              </button>
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
