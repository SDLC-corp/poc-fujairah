import { useMemo, useState } from 'react'
import { FiAlertTriangle, FiRadio, FiX } from 'react-icons/fi'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { BROADCAST_MAX_CHARS, sendBroadcast } from '../features/broadcast/broadcastSlice'
import { selectCurrentUser } from '../features/users/selectors'

/**
 * Report an incident to shipping.
 *
 * One dialog for every kind of thing the console raises — a dragging anchor, a
 * ship inside a prohibited area, an anchorage filling up. What changes between
 * them is the facts and the reasons worth choosing from, so those are passed
 * in; what does not change is the shape of the message, which is: here is what
 * we observed, here is what we think it is, here is what is being done.
 *
 * It goes out to the water, not to a mailbox. That is the whole audience now:
 * all ships, or the one ship it concerns. A vessel at anchor is called on the
 * radio rather than emailed, and the feed carries no address for her anyway —
 * only her name and her agent's — so a broadcast is the only channel that was
 * ever real here.
 *
 * The reason is a list because the causes worth acting on are a short known
 * set, and free text for all of it produces a log nobody can count. The note is
 * free text because the particulars never fit a list. Picking "Other" makes the
 * note required — "Other" says nothing on its own.
 */

/** All ships, or the one this is about. */
export type IncidentAudience = 'vessels' | 'vessel'

export interface IncidentMail {
  /** What to show afterwards: the one vessel called, or the size of the fleet. */
  to: string
  /** The vessels it went to, by name. */
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
   * Kept on the subject although the broadcast has no room to print it: what
   * raises these incidents knows the position, and a channel that can carry it
   * — a written notice to an agent, an export — should not have to go looking
   * for it again.
   */
  position?: { lat: number; lon: number } | null
  /** Causes and actions worth choosing from for this kind of incident. */
  reasons: string[]
}

export default function SendIncidentMailDialog({
  subject,
  onSend,
  onClose,
}: {
  subject: IncidentSubject
  onSend: (mail: IncidentMail) => void
  onClose: () => void
}) {
  const dispatch = useAppDispatch()
  const [audience, setAudience] = useState<IncidentAudience>('vessels')
  const [vesselId, setVesselId] = useState('')
  const [reason, setReason] = useState(subject.reasons[0] ?? 'Other')
  const [note, setNote] = useState('')

  const user = useAppSelector(selectCurrentUser)
  const vessels = useAppSelector((s) => s.portData.vessels)

  /** A vessel that has sailed is out of range and out of the port's business. */
  const afloat = useMemo(
    () => (vessels?.features ?? []).filter((v) => v.properties.status !== 'sailed'),
    [vessels],
  )
  const chosenVessel = afloat.find((v) => v.properties.id === vesselId) ?? null
  const reasonComplete = reason !== 'Other' || note.trim().length > 0

  /**
   * The incident as one line, for the radio.
   *
   * A broadcast is read aloud and carries 161 characters, so what goes in is who,
   * what, where and what is being done — and nothing else. Upper case, because
   * that is how a message to be spoken is written down.
   */
  const call = useMemo(() => {
    const who = audience === 'vessel' ? (chosenVessel?.properties.name ?? 'VESSEL') : 'ALL SHIPS'
    return [`${who}. FUJAIRAH PORT CONTROL`, subject.title, subject.subtitle, reason, note.trim()]
      .filter(Boolean)
      .join('. ')
      .replace(/\.\.+/g, '.')
      .toUpperCase()
  }, [audience, chosenVessel, subject.title, subject.subtitle, reason, note])

  const over = call.length > BROADCAST_MAX_CHARS

  /**
   * Who it went to. Names rather than addresses: the feed carries a ship's name
   * and her agent's, never a mailbox.
   */
  const recipients =
    audience === 'vessel'
      ? chosenVessel
        ? [chosenVessel.properties.name]
        : []
      : afloat.map((v) => v.properties.name)

  const audienceLabel =
    audience === 'vessel'
      ? (chosenVessel?.properties.name ?? 'a vessel')
      : `all ${afloat.length} vessels in the anchorage`

  const valid = recipients.length > 0 && reasonComplete && !over

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
          {/* Radios, not a checkbox: these are one exclusive choice, and which
              one is taken changes the opening words of the broadcast below. */}
          <div className="field">
            <span>
              Broadcast to <em className="req">*</em>
            </span>
            <div className="mail-audience">
              {(
                [
                  ['vessels', 'All vessels', `${afloat.length} afloat`],
                  ['vessel', 'One vessel', 'Addressed call'],
                ] as [IncidentAudience, string, string][]
              ).map(([id, label, hint]) => (
                <label key={id} className={`mail-audience-row${audience === id ? ' is-on' : ''}`}>
                  <input
                    type="radio"
                    name="incident-audience"
                    checked={audience === id}
                    onChange={() => setAudience(id)}
                  />
                  <span className="mail-audience-label">{label}</span>
                  <span className="muted mail-audience-note">{hint}</span>
                </label>
              ))}
            </div>
          </div>

          {audience === 'vessel' && (
            <label className="field">
              <span>
                Vessel <em className="req">*</em>
              </span>
              <select
                className="text-input"
                autoFocus
                value={vesselId}
                onChange={(e) => setVesselId(e.target.value)}
              >
                <option value="">Choose a vessel…</option>
                {afloat.map((v) => (
                  <option key={v.properties.id} value={v.properties.id}>
                    {v.properties.name}
                    {v.properties.area ? ` — Area ${v.properties.area}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>
              Reason <em className="req">*</em>
            </span>
            <select className="text-input" value={reason} onChange={(e) => setReason(e.target.value)}>
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

          {/* The broadcast itself, so it can be read straight off the screen. */}
          <pre className="anchor-mail-preview">{call}</pre>
          <small className={over ? 'field-error' : 'muted field-note'}>
            {call.length} / {BROADCAST_MAX_CHARS} characters
            {over
              ? ' — too long for one broadcast. Shorten the note.'
              : ' — the limit of a single broadcast.'}
          </small>
        </div>

        <footer className="dialog-actions role-dialog-foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!valid}
            onClick={() => {
              // Logged where every other broadcast is logged, so the record of
              // what was said to shipping is one list and not one per feature
              // that can raise an alarm.
              dispatch(
                sendBroadcast({
                  priority: 'urgency',
                  area: audience === 'vessel' ? (chosenVessel?.properties.area ?? null) : null,
                  text: call,
                  recipients: recipients.length,
                  by: user?.name ?? 'Port control',
                }),
              )
              onSend({ to: audienceLabel, recipients, reason, note: note.trim() })
            }}
          >
            <FiRadio size={15} /> Broadcast
          </button>
        </footer>
      </div>
    </div>
  )
}
