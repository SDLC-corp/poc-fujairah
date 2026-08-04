import { useState } from 'react'

/**
 * Collapsible raw-payload view. Every mock screen ships the JSON it would
 * consume from an API, so the shape of the contract is visible next to the UI.
 */
export default function RawJson({ label = 'Raw JSON', data }: { label?: string; data: unknown }) {
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(data, null, 2)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <details className="raw-json">
      <summary>
        <span className="raw-json-label">{label}</span>
        <span className="raw-json-size">{(text.length / 1024).toFixed(1)} KB</span>
      </summary>
      <div className="raw-json-body">
        <button type="button" className="raw-json-copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <pre>{text}</pre>
      </div>
    </details>
  )
}
