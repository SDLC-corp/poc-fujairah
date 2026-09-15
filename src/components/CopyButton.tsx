import { useEffect, useRef, useState } from 'react'
import { FiAlertCircle, FiCheck, FiCopy } from 'react-icons/fi'

/**
 * Copies a value to the clipboard and says whether it worked.
 *
 * Two ways of doing it, because one of them is not always available: the
 * clipboard API needs a secure context, which this console has on localhost and
 * behind TLS but not when it is served to the watch room over a plain LAN
 * address. So the modern call is tried first and the old selection trick picks
 * up after it, and if both are refused the button says so rather than flashing
 * a tick over nothing — a position the operator believes they copied and did
 * not is worse than no button at all.
 */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Falls through to the fallback below.
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    // Off-screen but still focusable — display:none cannot be selected.
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

export default function CopyButton({
  value,
  /** What is being copied, for the tooltip and for screen readers. */
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current)
    },
    [],
  )

  const Icon = state === 'done' ? FiCheck : state === 'failed' ? FiAlertCircle : FiCopy

  return (
    <button
      type="button"
      className={`copy-button${state === 'done' ? ' is-done' : ''}${
        state === 'failed' ? ' is-failed' : ''
      }${className ? ` ${className}` : ''}`}
      title={state === 'failed' ? 'Could not reach the clipboard' : `Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={async () => {
        setState((await copy(value)) ? 'done' : 'failed')
        if (timer.current != null) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setState('idle'), 1800)
      }}
    >
      <Icon size={13} aria-hidden="true" />
      <span className="copy-button-text">
        {state === 'done' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy'}
      </span>
    </button>
  )
}
