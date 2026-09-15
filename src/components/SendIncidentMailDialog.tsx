import { useState } from 'react'
import { FiAlertTriangle, FiMail, FiX } from 'react-icons/fi'

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
  to: string
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
  const [reason, setReason] = useState(subject.reasons[0] ?? 'Other')
  const [note, setNote] = useState('')

  const address = to.trim()
  const reasonComplete = reason !== 'Other' || note.trim().length > 0
  const valid = EMAIL_RE.test(address) && reasonComplete

  const body = [
    subject.title,
    subject.subtitle,
    '',
    ...subject.lines,
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
            <span>
              Send to <em className="req">*</em>
            </span>
            <input
              className="text-input"
              type="email"
              autoFocus
              autoComplete="off"
              placeholder="master@vessel.example"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
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
            onClick={() => onSend({ to: address, reason, note: note.trim() })}
          >
            <FiMail size={15} /> Send mail
          </button>
        </footer>
      </div>
    </div>
  )
}
