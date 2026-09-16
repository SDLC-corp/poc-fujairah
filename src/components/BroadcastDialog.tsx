import { useMemo, useState } from 'react'
import { FiCheck, FiCopy, FiRadio, FiX } from 'react-icons/fi'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { selectAreas } from '../features/analysis/selectors'
import {
  BROADCAST_MAX_CHARS,
  PRIORITIES,
  PRIORITY_ORDER,
  sendBroadcast,
} from '../features/broadcast/broadcastSlice'
import type { BroadcastPriority } from '../features/broadcast/broadcastSlice'
import { formatDateTime } from '../utils/format'
import { selectCurrentUser } from '../features/users/selectors'

/**
 * A message to every vessel in the anchorage.
 *
 * Laid out the way the service lays out an all-ships call, because that is what
 * the operator is composing and what the bridge at the other end expects to
 * hear: the priority signal, the call to all ships, who is calling, the message,
 * and who is out. Reading the preview aloud on VHF is a valid use of it, so the
 * preview is the message rather than a paraphrase of it.
 *
 * What the console can actually do with it is copy it and log it. A VTMIS sends
 * one of these as an AIS safety-related broadcast, and there is no transmitter
 * behind this PoC — so rather than flashing "Sent" over nothing, the dialog
 * hands the text over and records what went out and when.
 */

/**
 * Months spelled out here rather than taken from the locale.
 *
 * A date-time group is a fixed-width form and its month is always three
 * letters. `toLocaleString` with `month: 'short'` does not promise that and
 * en-GB does not deliver it — it returns `SEPT`, which is the one month of
 * twelve that would come out a character wider than the rest.
 */
const DTG_MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]

/** `031415 UTC AUG 26` — the date-time group a broadcast is stamped with. */
function dtg(at: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(at.getUTCDate())}${two(at.getUTCHours())}${two(at.getUTCMinutes())} UTC ${
    DTG_MONTHS[at.getUTCMonth()]
  } ${String(at.getUTCFullYear()).slice(2)}`
}

export default function BroadcastDialog({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch()
  const vessels = useAppSelector((s) => s.portData.vessels)
  const areas = useAppSelector(selectAreas)
  const log = useAppSelector((s) => s.broadcast.log)
  const user = useAppSelector(selectCurrentUser)

  const [priority, setPriority] = useState<BroadcastPriority>('safety')
  /** Empty means every vessel — the same convention the report facets use. */
  const [area, setArea] = useState('')
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)

  const anchorages = useMemo(
    () => areas.filter((a) => a.properties.category === 'anchorage'),
    [areas],
  )

  /**
   * Who would hear it.
   *
   * A vessel that has sailed is finished with the port and out of VHF range of
   * it soon enough; counting her would overstate the reach of every broadcast.
   * The count is the live fleet, so it is a fact rather than a label.
   */
  const audience = useMemo(() => {
    const all = (vessels?.features ?? []).filter((v) => v.properties.status !== 'sailed')
    return area ? all.filter((v) => v.properties.area === area) : all
  }, [vessels, area])

  const message = text.trim()
  const over = message.length > BROADCAST_MAX_CHARS
  const valid = message.length > 0 && !over && audience.length > 0

  const scopeLine = area
    ? `ANCHORAGE AREA ${area} · ${audience.length} VESSEL${audience.length === 1 ? '' : 'S'}`
    : `FUJAIRAH ANCHORAGE AREA · ALL ${audience.length} VESSELS`

  /** The broadcast itself, rebuilt as the fields change so it is never a guess. */
  const preview = useMemo(() => {
    const prefix = PRIORITIES[priority].prefix
    const out: string[] = []
    // The priority signal is spoken three times, and so written three times —
    // this is read off the screen onto the air, not summarised for a reader.
    if (prefix) out.push(`${prefix} ${prefix} ${prefix}`)
    out.push('ALL SHIPS ALL SHIPS ALL SHIPS')
    out.push('THIS IS FUJAIRAH PORT CONTROL')
    out.push('')
    out.push(message || '…')
    out.push('')
    out.push(scopeLine)
    out.push(dtg(new Date()))
    out.push('FUJAIRAH PORT CONTROL OUT')
    return out.join('\n')
  }, [priority, message, scopeLine])

  async function copy() {
    try {
      await navigator.clipboard.writeText(preview)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Refused outside a secure context. The preview is selectable, so there
      // is nothing to recover from.
    }
  }

  function send() {
    if (!valid) return
    dispatch(
      sendBroadcast({
        priority,
        area: area || null,
        text: message,
        recipients: audience.length,
        by: user?.name ?? 'Port control',
      }),
    )
    setSent(true)
    setText('')
  }

  const tone = PRIORITIES[priority].tone

  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label="Broadcast to all vessels">
      <div className="dialog-card broadcast-dialog">
        <header className="role-dialog-head">
          <span className="role-dialog-icon">
            <FiRadio size={18} />
          </span>
          <div>
            <h3>Broadcast to all vessels</h3>
            <p className="muted">
              {audience.length} vessel{audience.length === 1 ? '' : 's'} in{' '}
              {area ? `Area ${area}` : 'the anchorage'}
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <FiX size={19} />
          </button>
        </header>

        <div className="broadcast-body">
          <div className="field">
            <span>Priority</span>
            {/* Chips, not a dropdown: which one is chosen changes what the
                message *is*, so it has to be readable without opening it. */}
            <div className="broadcast-priorities">
              {PRIORITY_ORDER.map((id) => {
                const p = PRIORITIES[id]
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={priority === id}
                    className={`filter-chip chip-labelled bc-pri bc-pri-${p.tone}${
                      priority === id ? ' active' : ''
                    }`}
                    title={p.hint}
                    onClick={() => setPriority(id)}
                  >
                    {p.label}
                    {p.prefix && <em>{p.prefix}</em>}
                  </button>
                )
              })}
            </div>
            <small className="muted field-note">{PRIORITIES[priority].hint}</small>
          </div>

          <label className="field">
            <span>Addressed to</span>
            <select className="text-input" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Every vessel in the anchorage</option>
              {anchorages.map((a) => (
                <option key={a.properties.id} value={a.properties.code}>
                  Area {a.properties.code} — {a.properties.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>
              Message <em className="req">*</em>
            </span>
            <textarea
              className={`text-input${over ? ' is-bad' : ''}`}
              rows={3}
              autoFocus
              placeholder="NORTHERLY WIND GUSTING 35 KNOTS EXPECTED 1800–2200. VESSELS AT ANCHOR KEEP MAIN ENGINES ON STANDBY."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <small className={over ? 'field-error' : 'muted field-note'}>
              {message.length} / {BROADCAST_MAX_CHARS} characters
              {over
                ? ' — too long for one AIS safety broadcast.'
                : ' — the limit of a single AIS safety broadcast.'}
            </small>
          </label>

          <div className="field">
            <span>As it goes out</span>
            <pre className={`broadcast-preview bc-pre-${tone}`}>{preview}</pre>
          </div>

          {sent && (
            <p className="broadcast-sent" role="status">
              Logged and handed over. There is no transmitter behind this console — copy the text
              above to read it out or to paste it into the VTMIS.
            </p>
          )}

          {log.length > 0 && (
            <div className="field">
              <span>Recent broadcasts</span>
              <ul className="broadcast-log">
                {log.slice(0, 4).map((b) => (
                  <li key={b.id}>
                    <span className={`badge badge-${PRIORITIES[b.priority].tone}`}>
                      {PRIORITIES[b.priority].label}
                    </span>
                    <span className="broadcast-log-text">{b.text}</span>
                    <span className="muted broadcast-log-meta">
                      {b.area ? `Area ${b.area}` : 'All vessels'} · {b.recipients} · {b.by} ·{' '}
                      {formatDateTime(b.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="dialog-actions role-dialog-foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
          <button type="button" className="ghost-button" disabled={!valid} onClick={copy}>
            {copied ? <FiCheck size={14} /> : <FiCopy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="primary-button" disabled={!valid} onClick={send}>
            <FiRadio size={15} /> Broadcast
          </button>
        </footer>
      </div>
    </div>
  )
}
