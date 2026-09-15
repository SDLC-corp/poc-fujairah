import { useEffect, useRef, useState } from 'react'
import { FiChevronDown } from 'react-icons/fi'
import { useAppDispatch } from '../app/hooks'
import { setVesselTrackSource } from '../features/portData/portDataSlice'
import { SOURCE_ORDER, SOURCES } from '../map/trackSources'
import type { Source } from '../map/trackSources'

/**
 * Which sensor is holding the track, labelled the way a VTMIS labels it.
 *
 * A position on its own is not a fact of uniform quality, and the operator's
 * first question about an unexpected one is "where is this coming from". The
 * VTMIS answers it on every object it sends, so the console says the same thing
 * in the same place — beside the control that goes to the track.
 *
 * The tag is also the control: clicking it opens the list and picking a source
 * sets it for that vessel. In service the feed would be telling the console
 * this rather than the other way round; the picker is here so the console can
 * be shown behaving correctly under each of them, and because an operator who
 * knows a track is radar-only has, today, nowhere to record that.
 */
export default function TrackSourceTag({
  vesselId,
  source,
}: {
  vesselId: string
  source: Source
}) {
  const dispatch = useAppDispatch()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)

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

  const current = SOURCES[source]

  return (
    <span className="source-picker" ref={rootRef}>
      <button
        type="button"
        className={`badge badge-${current.tone} source-badge`}
        title={current.hint}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Track source: ${current.label}. Change it.`}
        onClick={() => setOpen((v) => !v)}
      >
        {current.label}
        <FiChevronDown size={11} aria-hidden="true" />
      </button>

      {open && (
        <div className="source-menu" role="listbox" aria-label="Track source">
          <p className="source-menu-head muted">Track source</p>
          {SOURCE_ORDER.map((id) => {
            const s = SOURCES[id]
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={id === source}
                className={`source-option${id === source ? ' is-on' : ''}`}
                onClick={() => {
                  dispatch(setVesselTrackSource({ vesselId, source: id }))
                  setOpen(false)
                }}
              >
                <span className={`badge badge-${s.tone} source-badge`}>{s.label}</span>
                <span className="source-option-hint">{s.hint}</span>
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}
