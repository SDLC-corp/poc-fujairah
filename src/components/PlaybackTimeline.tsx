import { useEffect, useMemo, useRef, useState } from 'react'
import { FiX } from 'react-icons/fi'
import { VESSEL_COLORS, VESSEL_LABELS } from '../map/vesselTypes'
import type { VesselType } from '../types/gis'
import type { PlaybackSample, PlaybackVessel } from '../types/playback'

/**
 * The followed vessels' recorded day, read down the page.
 *
 * The scrubber says where the playhead is but not what is there; this is the
 * same tracks as a log. With more than one vessel followed the entries are
 * merged into a single column in time order, which is the only arrangement that
 * answers the question a multi-vessel replay is opened for — what was the other
 * ship doing when this one did that. Every row therefore names its vessel and
 * carries her colour; without that a merged column is unreadable.
 *
 * Clicking a row moves the playhead to that fix, so the timeline drives the
 * replay as well as reading it.
 */

interface Props {
  /** The followed vessels, in the order the picker holds them. */
  vessels: PlaybackVessel[]
  primaryId: string | null
  /**
   * The replayed window, already written out.
   *
   * A range rather than a day, because the window can span several: a single
   * date at the head of this column would name one of them and quietly deny the
   * rest.
   */
  range: string
  /** Timestamp under the playhead, used to mark and scroll to the current row. */
  playheadAt: string | null
  /** The chosen row's own timestamp — the playhead is placed by time. */
  onPick: (at: string) => void
  onClose: () => void
}

type MarkKind = 'start' | 'end' | 'underway' | 'anchored' | 'fix'
type Mark = { title: string; kind: MarkKind }

interface Row {
  key: string
  vesselId: string
  name: string
  color: string
  index: number
  lastIndex: number
  fix: PlaybackSample
  mark: Mark
}

/**
 * What happened at this fix, if anything. Only the ends of the record and the
 * changes of state are events; everything between them is the track ticking
 * over, and labelling those "position fix" keeps the column honest rather than
 * inventing something for each one.
 */
function markFor(track: PlaybackSample[], i: number): Mark {
  if (i === 0) return { title: 'Start of record', kind: 'start' }
  if (i === track.length - 1) return { title: 'End of record', kind: 'end' }

  const previous = track[i - 1].status
  const now = track[i].status
  if (previous !== now) {
    return now === 'underway'
      ? { title: 'Got under way', kind: 'underway' }
      : { title: 'Anchored', kind: 'anchored' }
  }
  return { title: 'Position fix', kind: 'fix' }
}

const clock = (iso: string) => new Date(iso).toISOString().slice(11, 16)

/** `03 Aug 14:20` — for a column whose rows can fall on different days. */
const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })

export default function PlaybackTimeline({
  vessels,
  primaryId,
  range,
  playheadAt,
  onPick,
  onClose,
}: Props) {
  const listRef = useRef<HTMLOListElement | null>(null)
  const seenRef = useRef('')

  /** Which of the followed vessels are listed. Empty means all of them. */
  const [hidden, setHidden] = useState<string[]>([])
  /**
   * null = decide from the number of vessels. One ship's day is 73 fixes and
   * reads as a log; three ships' is 219 and reads as noise, so a merged
   * timeline starts on events only until the operator asks for the rest.
   */
  const [mode, setMode] = useState<'events' | 'all' | null>(null)

  const shown = vessels.filter((v) => !hidden.includes(v.id))
  const effectiveMode = mode ?? (shown.length > 1 ? 'events' : 'all')

  const rows = useMemo(() => {
    const out: Row[] = []
    for (const vessel of shown) {
      const color = VESSEL_COLORS[vessel.type as VesselType] ?? '#94a3b8'
      for (let i = 0; i < vessel.track.length; i++) {
        const mark = markFor(vessel.track, i)
        if (effectiveMode === 'events' && mark.kind === 'fix') continue
        out.push({
          key: `${vessel.id}:${i}`,
          vesselId: vessel.id,
          name: vessel.name,
          color,
          index: i,
          lastIndex: vessel.track.length - 1,
          fix: vessel.track[i],
          mark,
        })
      }
    }
    // Time order, then by name so two vessels sharing an instant stay stable.
    out.sort((a, b) => a.fix.at.localeCompare(b.fix.at) || a.name.localeCompare(b.name))
    return out
  }, [shown, effectiveMode])

  /** Read off the rows themselves, so it tracks what is listed. */
  const multiDay =
    rows.length > 1 && rows[0].fix.at.slice(0, 10) !== rows[rows.length - 1].fix.at.slice(0, 10)

  /** The last row at or before the playhead — what the chart is showing now. */
  const currentKey = useMemo(() => {
    if (!playheadAt) return ''
    let key = ''
    for (const row of rows) {
      if (row.fix.at > playheadAt) break
      key = row.key
    }
    return key
  }, [rows, playheadAt])

  /**
   * Follow the playhead, but only when it actually moves to a different row —
   * during playback `progress` changes every frame while the row it maps to
   * holds for a hundred of them, and scrolling on each one fights the operator
   * the moment they try to read further down.
   */
  useEffect(() => {
    if (!currentKey || currentKey === seenRef.current) return
    seenRef.current = currentKey
    const index = rows.findIndex((r) => r.key === currentKey)
    const row = index >= 0 ? (listRef.current?.children[index] as HTMLElement | undefined) : undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [currentKey, rows])

  const toggleVessel = (id: string) =>
    setHidden((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))

  return (
    <aside className="pb-tl-panel" aria-label="Event timeline">
      <header className="pb-tl-head">
        <div className="pb-tl-title">
          <strong>Event timeline</strong>
          <span className="muted">
            {rows.length} {effectiveMode === 'events' ? 'events' : 'fixes'} ·{' '}
            {shown.length} of {vessels.length} vessels
          </span>
        </div>
        <button type="button" className="icon-button" aria-label="Hide timeline" onClick={onClose}>
          <FiX size={17} />
        </button>
      </header>

      {/* Filter: which of the followed vessels this column lists. */}
      {vessels.length > 1 && (
        <div className="pb-tl-filter">
          {vessels.map((v) => {
            const on = !hidden.includes(v.id)
            const color = VESSEL_COLORS[v.type as VesselType] ?? '#94a3b8'
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={on}
                className={`pb-tl-chip${on ? ' active' : ''}`}
                style={on ? { borderColor: color } : undefined}
                title={`${v.name} — ${VESSEL_LABELS[v.type as VesselType] ?? v.type}`}
                onClick={() => toggleVessel(v.id)}
              >
                <span className="dot" style={{ background: color }} />
                {v.name}
                {v.id === primaryId && <em>front</em>}
              </button>
            )
          })}
        </div>
      )}

      <div className="pb-tl-sub">
        <span className="pb-tl-date">{range}</span>
        <span className="pb-tl-modes">
          {(['events', 'all'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={effectiveMode === m}
              className={`pb-tl-chip${effectiveMode === m ? ' active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'events' ? 'Events' : 'All fixes'}
            </button>
          ))}
        </span>
      </div>

      <ol className="pb-tl" ref={listRef}>
        {rows.map((row) => {
          const on = row.key === currentKey
          return (
            <li
              key={row.key}
              className={`pb-tl-item pb-tl-${row.mark.kind}${on ? ' is-current' : ''}`}
              aria-current={on ? 'true' : undefined}
            >
              <button type="button" onClick={() => onPick(row.fix.at)} title="Move the playhead here">
                {/* Dated only when the column spans more than one day, where a
                    bare clock would put two different moments under one label. */}
                <span className="pb-tl-time">
                  {multiDay ? stamp(row.fix.at) : clock(row.fix.at)}
                </span>
                <span className="pb-tl-node" aria-hidden="true" style={{ color: row.color }} />
                <span className="pb-tl-body">
                  {/* Named on every row: a merged column is unreadable without it. */}
                  <span className="pb-tl-vessel" style={{ color: row.color }}>
                    {row.name}
                    {row.vesselId === primaryId && vessels.length > 1 && (
                      <em className="pb-tl-front">front</em>
                    )}
                  </span>
                  <span className="pb-tl-what">{row.mark.title}</span>
                  <span className="pb-tl-meta">
                    {String(row.fix.headingDeg).padStart(3, '0')}° ·{' '}
                    {row.fix.speedKn.toFixed(1)} kn
                  </span>
                  <span className="pb-tl-pos">
                    {row.fix.lat.toFixed(5)}°N, {row.fix.lon.toFixed(5)}°E
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {rows.length === 0 && (
          <li className="pb-tl-empty muted">
            {vessels.length === 0
              ? 'No vessel followed.'
              : shown.length === 0
                ? 'Every followed vessel is filtered out.'
                : 'No positions were recorded in this window.'}
          </li>
        )}
      </ol>
    </aside>
  )
}
