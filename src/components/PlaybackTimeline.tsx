import { useEffect, useRef } from 'react'
import { FiX } from 'react-icons/fi'
import type { PlaybackSample, PlaybackVessel } from '../types/playback'

/**
 * The followed vessel's recorded day, read down the page.
 *
 * The scrubber says where the playhead is but not what is there; this is the
 * same track as a log — every fix with its time, heading and position, and the
 * moments she changed state called out rather than left to be spotted in a
 * column of identical rows. Clicking a fix moves the playhead to it, so the
 * timeline is a way of driving the replay as well as reading it.
 */

interface Props {
  vessel: PlaybackVessel
  day: string
  /** Index of the fix under the playhead. */
  current: number
  onPick: (index: number) => void
  onClose: () => void
}

type Mark = { title: string; kind: 'start' | 'end' | 'underway' | 'anchored' | 'fix' }

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

/** "2026-08-03" -> "03 Aug 2026". */
function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const clock = (iso: string) => new Date(iso).toISOString().slice(11, 16)

export default function PlaybackTimeline({ vessel, day, current, onPick, onClose }: Props) {
  const listRef = useRef<HTMLOListElement | null>(null)
  const seenRef = useRef(-1)

  /**
   * Follow the playhead, but only when it actually moves to a different fix —
   * during playback `progress` changes every frame while the index it maps to
   * holds for a hundred of them, and scrolling on each one fights the operator
   * the moment they try to read further down.
   */
  useEffect(() => {
    if (current === seenRef.current) return
    seenRef.current = current
    const row = listRef.current?.children[current] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
  }, [current])

  return (
    <aside className="pb-tl-panel" aria-label={`Track timeline for ${vessel.name}`}>
      <header className="pb-tl-head">
        <div className="pb-tl-title">
          <strong>Event timeline</strong>
          <span className="muted">
            {vessel.name} · {vessel.track.length} fixes
          </span>
        </div>
        <button type="button" className="icon-button" aria-label="Hide timeline" onClick={onClose}>
          <FiX size={17} />
        </button>
      </header>

      <p className="pb-tl-date">{dayLabel(day)}</p>

      <ol className="pb-tl" ref={listRef}>
        {vessel.track.map((fix, i) => {
          const mark = markFor(vessel.track, i)
          const on = i === current
          return (
            <li
              key={fix.at}
              className={`pb-tl-item pb-tl-${mark.kind}${on ? ' is-current' : ''}`}
              aria-current={on ? 'true' : undefined}
            >
              <button type="button" onClick={() => onPick(i)} title="Move the playhead here">
                <span className="pb-tl-time">{clock(fix.at)}</span>
                <span className="pb-tl-node" aria-hidden="true" />
                <span className="pb-tl-body">
                  <span className="pb-tl-what">{mark.title}</span>
                  <span className="pb-tl-meta">
                    {String(fix.headingDeg).padStart(3, '0')}° · {fix.speedKn.toFixed(1)} kn
                  </span>
                  <span className="pb-tl-pos">
                    {fix.lat.toFixed(5)}°N, {fix.lon.toFixed(5)}°E
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
