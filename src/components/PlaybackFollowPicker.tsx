import { useEffect, useMemo, useRef, useState } from 'react'
import { FiChevronDown, FiSearch } from 'react-icons/fi'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
  setFollowIds,
  setPlaybackVessel,
  toggleFollow,
} from '../features/playback/playbackSlice'
import { VESSEL_COLORS, VESSEL_LABELS } from '../map/vesselTypes'
import type { VesselType } from '../types/gis'
import type { PlaybackVessel } from '../types/playback'

/**
 * Chooses which of the recorded vessels the replay draws.
 *
 * A dropdown rather than the row of chips the rest of the console uses: there
 * are thirty ships in the file and only a handful are ever wanted at once, so
 * the list is searched rather than scanned, and the bar keeps the room the
 * transport needs.
 *
 * Two different choices live in one row — whether a vessel is drawn at all (the
 * checkbox) and which one is the subject (the name). Keeping them apart means
 * bringing a vessel to the front never silently drops the others.
 */

/** Above this, following everything is almost certainly a mis-click. */
const FOLLOW_ALL_LIMIT = 12

export default function PlaybackFollowPicker({ fleet }: { fleet: PlaybackVessel[] }) {
  const dispatch = useAppDispatch()
  const primaryId = useAppSelector((s) => s.playback.vesselId)
  const followIds = useAppSelector((s) => s.playback.followIds)

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
    return fleet.filter(
      (v) => v.name.toLowerCase().includes(q) || v.area.toLowerCase().includes(q),
    )
  }, [fleet, query])

  const primary = fleet.find((v) => v.id === primaryId)

  return (
    <div className="pb-follow" ref={rootRef}>
      <button
        type="button"
        className="pb-select pb-follow-button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pb-follow-summary">
          {primary ? primary.name : 'No vessel'}
          {followIds.length > 1 && (
            <em className="pb-follow-count">+{followIds.length - 1}</em>
          )}
        </span>
        <FiChevronDown size={14} />
      </button>

      {open && (
        <div className="pb-follow-menu" role="listbox" aria-label="Vessels to follow">
          <label className="pb-follow-search">
            <FiSearch size={14} />
            <input
              className="text-input"
              type="search"
              autoFocus
              placeholder="Search name or area…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <ul className="pb-follow-list">
            {shown.map((v) => {
              const following = followIds.includes(v.id)
              const isPrimary = v.id === primaryId
              // The last one standing cannot be unticked — see `toggleFollow`.
              const locked = following && followIds.length === 1
              return (
                <li key={v.id} className={isPrimary ? 'is-primary' : undefined}>
                  <input
                    type="checkbox"
                    checked={following}
                    disabled={locked}
                    aria-label={`Follow ${v.name}`}
                    title={locked ? 'At least one vessel must be followed' : undefined}
                    onChange={() => dispatch(toggleFollow(v.id))}
                  />
                  <button
                    type="button"
                    className="pb-follow-name"
                    title="Bring to the front"
                    onClick={() => dispatch(setPlaybackVessel(v.id))}
                  >
                    <span
                      className="dot"
                      style={{ background: VESSEL_COLORS[v.type as VesselType] ?? '#94a3b8' }}
                    />
                    <span className="pb-follow-text">
                      <strong>{v.name}</strong>
                      <small className="muted">
                        {VESSEL_LABELS[v.type as VesselType] ?? v.type} ·{' '}
                        {v.movement === 'arrival' ? 'Arrival' : 'Departure'} · {v.area}
                      </small>
                    </span>
                    {isPrimary && <em className="pb-follow-tag">Front</em>}
                  </button>
                </li>
              )
            })}
            {shown.length === 0 && <li className="muted pb-follow-empty">No vessel matches.</li>}
          </ul>

          <div className="pb-follow-foot">
            <span className="muted">
              {followIds.length} of {fleet.length} followed
            </span>
            <span className="pb-follow-bulk">
              <button
                type="button"
                className="link-cell"
                disabled={fleet.length > FOLLOW_ALL_LIMIT}
                title={
                  fleet.length > FOLLOW_ALL_LIMIT
                    ? `Too many to follow at once — ${fleet.length} tracks would be unreadable`
                    : undefined
                }
                onClick={() => dispatch(setFollowIds(fleet.map((v) => v.id)))}
              >
                Follow all
              </button>
              <button
                type="button"
                className="link-cell"
                disabled={followIds.length <= 1}
                onClick={() => dispatch(setFollowIds(primaryId ? [primaryId] : []))}
              >
                Just this one
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
