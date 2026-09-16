import { useState } from 'react'
import { FiRadio } from 'react-icons/fi'
import { useAppSelector } from '../app/hooks'
import BroadcastDialog from './BroadcastDialog'

/**
 * The all-ships call, reachable from every screen.
 *
 * In the header rather than on a screen of its own because of when it gets
 * used: a squall coming through or a vessel adrift is not a reason to go and
 * find the right tab first. It is the one action in this console addressed to
 * the water rather than to the record, so it sits in the chrome with the other
 * things that are always true.
 *
 * The count on the badge is the live fleet, so the button says how many would
 * hear it before it is pressed.
 */
export default function BroadcastButton() {
  const [open, setOpen] = useState(false)
  const afloat = useAppSelector(
    (s) => (s.portData.vessels?.features ?? []).filter((v) => v.properties.status !== 'sailed').length,
  )

  return (
    <>
      <button
        type="button"
        className="header-action"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Broadcast a message to all ${afloat} vessels in the anchorage`}
        aria-label={`Broadcast to all vessels. ${afloat} in the anchorage.`}
        onClick={() => setOpen(true)}
      >
        <FiRadio size={15} aria-hidden="true" />
        <span className="header-action-text">Broadcast</span>
      </button>

      {open && <BroadcastDialog onClose={() => setOpen(false)} />}
    </>
  )
}
