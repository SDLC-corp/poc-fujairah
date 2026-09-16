import { useState } from 'react'
import { FiAlertTriangle, FiMail, FiX } from 'react-icons/fi'
import { useAppSelector } from '../app/hooks'
import { formatLatLon } from '../utils/format'

/**
 * Report an incident by mail.
 *
 * One dialog for every kind of thing the console raises — a dragging anchor, a
 * ship inside a prohibited area, an anchorage filling up. What changes between
 * them is the facts and the reasons worth choosing from, so those are passed
 * in; what does not change is the shape of the message, which is: here is what
 * we observed, here is what we think it is, here is what is being done.
 *
 * The reason is a list because the causes worth acting on are a short known
 * set, and free text for all of it produces a log nobody can count. The note is
 * free text because the particulars never fit a list. Picking "Other" makes the
 * note required — "Other" says nothing on its own.
 */

export interface IncidentMail {
  /** What to show afterwards: one address, or a description of the group. */
  to: string
  /** The addresses the message would actually go to. */
  recipients: string[]
  reason: string
  note: string
}

export interface IncidentSubject {
  /** Headline of the message and of the dialog. */
  title: string
  /** Where and what, under the title. */
  subtitle: string
  /** The observed facts, one per line, already worded for a reader. */
  lines: string[]
  /**
   * Where it is, when it has one place.
   *
   * Every one of these incidents happens somewhere, and the reader of the mail
   * is usually not sitting at the console that raised it — so the position goes
   * with the words. Both forms and a link: a bridge plots degrees and minutes,
   * anything that parses the message wants decimal, and whoever opens it on a
   * phone wants to tap it.
   */
  position?: { lat: number; lon: number } | null
  /** Causes and actions worth choosing from for this kind of incident. */
  reasons: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SendIncidentMailDialog({
  subject,
  onSend,
  onClose,
}: {
  subject: IncidentSubject
  onSend: (mail: IncidentMail) => void
  onClose: () => void
}) {
  const [to, setTo] = useState('')
  const [toAll, setToAll] = useState(false)
  const [reason, setReason] = useState(subject.reasons[0] ?? 'Other')
  const [note, setNote] = useState('')

  /**
   * "Everyone" is the console's own accounts, not an invented list.
   *
   * Deactivated ones are left out: an account that cannot sign in is not a
   * person on watch, and an incident notice going to it is a notice nobody
   * reads.
   */
  const everyone = useAppSelector((s) => s.users.users.filter((u) => u.active))

  const address = to.trim()
  const reasonComplete = reason !== 'Other' || note.trim().length > 0
  const recipients = toAll ? everyone.map((u) => u.email) : address ? [address] : []
  const valid = recipients.length > 0 && (toAll || EMAIL_RE.test(address)) && reasonComplete

  const p = subject.position
  const body = [
    subject.title,
    subject.subtitle,
    '',
    ...subject.lines,
    ...(p
      ? [
          '',
          'POSITION',
          `  ${formatLatLon(p.lat, p.lon)}`,
          `  ${p.lat.toFixed(5)}°N, ${p.lon.toFixed(5)}°E`,
          `  https://www.openstreetmap.org/?mlat=${p.lat.toFixed(5)}&mlon=${p.lon.toFixed(5)}#map=13/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}`,
        ]
      : []),
    '',
    `Reason: ${reason}`,
    note.trim() ? `Note:   ${note.trim()}` : '',
    '',
    '— Port of Fujairah, Anchorage Management System',
  ]
    // Collapses the blank line a missing note would otherwise leave behind.
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n')

  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label={`Report: ${subject.title}`}>
      <div className="dialog-card anchor-mail">
        <header className="role-dialog-head">
          <span className="role-dialog-icon is-alert">
            <FiAlertTriangle size={18} />
          </span>
          <div>
            <h3>Report incident</h3>
            <p className="muted">{subject.title}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <FiX size={19} />
          </button>
        </header>

        <div className="anchor-mail-body">
          <label className="field">
            <span>Send to {!toAll && <em className="req">*</em>}</span>
            <input
              className="text-input"
              type="email"
              autoFocus
              autoComplete="off"
              placeholder={toAll ? 'Going to everyone on watch' : 'captain@vessel.example'}
              // Off rather than hidden: the operator can see the field is still
              // there and what turning the tick back off would return them to.
              disabled={toAll}
              value={toAll ? '' : to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>

          {/* One tick, no second address list to keep: either this goes to the
              person who can act on it, or it goes to the whole watch. */}
          <label className="share-include mail-all">
            <input
              type="checkbox"
              checked={toAll}
              onChange={(e) => setToAll(e.target.checked)}
            />
            Send to everyone on the console
            <span className="muted">
              {everyone.length} active {everyone.length === 1 ? 'account' : 'accounts'}
            </span>
          </label>

          <label className="field">
            <span>
              Reason <em className="req">*</em>
            </span>
            <select
              className="text-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {subject.reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Notes {reason === 'Other' && <em className="req">*</em>}</span>
            <textarea
              className="text-input"
              rows={3}
              maxLength={300}
              placeholder={
                reason === 'Other'
                  ? 'Say what is happening — this is the only record of it.'
                  : 'Action taken, orders given, anything the reader needs'
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <pre className="anchor-mail-preview">{body}</pre>
        </div>

        <footer className="dialog-actions role-dialog-foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!valid}
            onClick={() =>
              onSend({
                to: toAll
                  ? `everyone on the console (${everyone.length})`
                  : address,
                recipients,
                reason,
                note: note.trim(),
              })
            }
          >
            <FiMail size={15} /> Send mail
          </button>
        </footer>
      </div>
    </div>
  )
}
