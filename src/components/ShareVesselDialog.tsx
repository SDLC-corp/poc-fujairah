import { useMemo, useState } from 'react'
import { FiCheck, FiCopy, FiMail, FiShare2, FiX } from 'react-icons/fi'
import { formatLatLon, formatLatLonDecimal } from '../utils/format'

/**
 * Share a vessel's record by email.
 *
 * There is no mail service behind this console, so rather than pretending to
 * send, it composes the message and hands it over: `mailto:` opens it in
 * whatever the operator actually uses, and Copy puts the same text on the
 * clipboard for anything else. Both are real actions — a "Sent" toast over a
 * message that went nowhere is the one outcome worth avoiding.
 */

export interface ShareSection {
  id: string
  label: string
  rows: [string, string][]
}

interface Props {
  title: string
  subtitle: string
  sections: ShareSection[]
  /** Included as coordinates and as a link anyone can open. */
  position: { lat: number; lon: number } | null
  onClose: () => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Splits on commas and semicolons, so a pasted address list just works. */
function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function ShareVesselDialog({
  title,
  subtitle,
  sections,
  position,
  onClose,
}: Props) {
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [includePosition, setIncludePosition] = useState(true)
  const [included, setIncluded] = useState<string[]>(() => sections.map((s) => s.id))
  const [copied, setCopied] = useState(false)

  const recipients = parseRecipients(to)
  const badAddress = recipients.find((r) => !EMAIL_RE.test(r))
  const nothingChosen = included.length === 0 && !includePosition
  const valid = recipients.length > 0 && !badAddress && !nothingChosen

  const mapLink = position
    ? `https://www.openstreetmap.org/?mlat=${position.lat.toFixed(5)}&mlon=${position.lon.toFixed(5)}#map=13/${position.lat.toFixed(5)}/${position.lon.toFixed(5)}`
    : null

  /** The message itself, rebuilt as the toggles change so it is never a guess. */
  const body = useMemo(() => {
    const out: string[] = [title, subtitle, '']

    if (note.trim()) out.push(note.trim(), '')

    if (includePosition && position) {
      out.push('POSITION')
      // Degrees and minutes for whoever reads it, plain decimal for whatever
      // parses it, and a link for anyone who just wants to see where it is.
      out.push(`  ${formatLatLon(position.lat, position.lon)}`)
      out.push(`  ${formatLatLonDecimal(position.lat, position.lon)}`)
      if (mapLink) out.push(`  ${mapLink}`)
      out.push('')
    }

    for (const section of sections) {
      if (!included.includes(section.id)) continue
      out.push(section.label.toUpperCase())
      // Padded so the values line up when read in a plain-text mail client.
      const width = Math.max(...section.rows.map(([k]) => k.length))
      for (const [k, v] of section.rows) out.push(`  ${k.padEnd(width)}   ${v}`)
      out.push('')
    }

    out.push('— Port of Fujairah, Anchorage Management System')
    return out.join('\n')
  }, [title, subtitle, note, includePosition, position, mapLink, sections, included])

  const subject = `${title} — anchorage record`

  function toggleSection(id: string) {
    setIncluded((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is refused outside a secure context; the preview is right
      // there and selectable, so there is nothing to recover from.
    }
  }

  function sendMail() {
    if (!valid) return
    const href = `mailto:${encodeURIComponent(recipients.join(','))}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`
    window.location.href = href
    onClose()
  }

  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label={`Share ${title}`}>
      <div className="dialog-card share-dialog">
        <header className="role-dialog-head">
          <span className="role-dialog-icon">
            <FiShare2 size={18} />
          </span>
          <div>
            <h3>Share vessel record</h3>
            <p className="muted">{title}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <FiX size={19} />
          </button>
        </header>

        <div className="share-body">
          <label className="field">
            <span>
              Send to <em className="req">*</em>
            </span>
            <input
              className="text-input"
              type="email"
              multiple
              autoComplete="off"
              placeholder="agent@example.com, vts@fujairahport.ae"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {badAddress ? (
              <small className="field-error">{badAddress} is not a valid address.</small>
            ) : (
              <small className="muted field-note">
                Separate several with commas.
                {recipients.length > 1 && ` ${recipients.length} recipients.`}
              </small>
            )}
          </label>

          <div className="field">
            <span>Include</span>
            <div className="share-includes">
              {position && (
                <label className="share-include">
                  <input
                    type="checkbox"
                    checked={includePosition}
                    onChange={(e) => setIncludePosition(e.target.checked)}
                  />
                  Position &amp; map link
                </label>
              )}
              {sections.map((s) => (
                <label key={s.id} className="share-include">
                  <input
                    type="checkbox"
                    checked={included.includes(s.id)}
                    onChange={() => toggleSection(s.id)}
                  />
                  {s.label}
                </label>
              ))}
            </div>
            {nothingChosen && (
              <small className="field-error">Choose at least one thing to send.</small>
            )}
          </div>

          <label className="field">
            <span>Note</span>
            <textarea
              className="text-input"
              rows={2}
              maxLength={300}
              placeholder="Anything the recipient needs to know"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <div className="field">
            <span>Preview</span>
            <pre className="share-preview">{body}</pre>
          </div>
        </div>

        <footer className="dialog-actions role-dialog-foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ghost-button" onClick={copy}>
            {copied ? <FiCheck size={14} /> : <FiCopy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="primary-button" disabled={!valid} onClick={sendMail}>
            <FiMail size={15} /> Open in mail
          </button>
        </footer>
      </div>
    </div>
  )
}
