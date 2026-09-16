import { useState } from 'react'
import { FiMail, FiX } from 'react-icons/fi'
import { formatLatLon, formatLatLonDecimal } from '../utils/format'

/**
 * Send the master the position she is to anchor in.
 *
 * Deliberately one thing only: an address, the coordinates, and Send. An
 * assignment notice is read on a bridge, often on a phone, usually in a hurry —
 * anything past the latitude and longitude is something for the eye to get lost
 * in. What to include, what to attach and what to copy are decisions nobody
 * needs to make here, so they are not offered.
 */

export interface AnchorNotice {
  vesselId: string
  vesselName: string
  areaCode: string
  spotId: string
  coordinates: [number, number]
}

interface Props {
  notice: AnchorNotice
  onSend: (to: string) => void
  onClose: () => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SendAnchorPositionDialog({ notice, onSend, onClose }: Props) {
  const [to, setTo] = useState('')
  const [touched, setTouched] = useState(false)

  const address = to.trim()
  const valid = EMAIL_RE.test(address)
  const [lon, lat] = notice.coordinates

  const body = [
    `${notice.vesselName} — anchor position`,
    '',
    `Area ${notice.areaCode}, spot ${notice.spotId}`,
    formatLatLon(lat, lon),
    formatLatLonDecimal(lat, lon),
    '',
    '— Port of Fujairah, Anchorage Management System',
  ].join('\n')

  function send() {
    if (!valid) return
    onSend(address)
  }

  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label="Send anchor position">
      <div className="dialog-card anchor-mail">
        <header className="role-dialog-head">
          <span className="role-dialog-icon">
            <FiMail size={18} />
          </span>
          <div>
            <h3>Send anchor position</h3>
            <p className="muted">
              {notice.vesselName} · Area {notice.areaCode} · spot {notice.spotId}
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <FiX size={19} />
          </button>
        </header>

        <div className="anchor-mail-body">
          {/* Both forms: the bridge plots degrees and minutes, anything that
              parses the mail afterwards wants decimal. */}
          <div className="anchor-mail-pos">
            <strong>{formatLatLon(lat, lon)}</strong>
            <span className="muted">{formatLatLonDecimal(lat, lon)}</span>
          </div>

          <label className="field">
            <span>
              Email <em className="req">*</em>
            </span>
            <input
              className="text-input"
              type="email"
              autoFocus
              autoComplete="off"
              placeholder="captain@vessel.example"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send()
              }}
            />
            {touched && address && !valid && (
              <small className="field-error">{address} is not a valid address.</small>
            )}
          </label>

          <pre className="anchor-mail-preview">{body}</pre>
        </div>

        <footer className="dialog-actions role-dialog-foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!valid} onClick={send}>
            <FiMail size={15} /> Send mail
          </button>
        </footer>
      </div>
    </div>
  )
}
