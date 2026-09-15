import { useState } from 'react'
import { flagName } from '../utils/flags'

/**
 * The ensign a vessel wears, as an image.
 *
 * Country-flag emoji would need no network, but Windows has no glyphs for them
 * — Chrome and Edge render "AE" as two letters in a box — and this console is
 * run on Windows. So the flags are images, and the ISO code takes over the
 * moment one fails to load: offline, or behind a filter, the column still reads
 * correctly rather than showing a row of broken-image marks.
 *
 * Swap `SOURCE` for a local `/flags/` folder if the deployment has no outbound
 * network. Nothing else here changes.
 */
const SOURCE = (code: string, width: 40 | 80) =>
  `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`

export default function FlagIcon({
  code,
  /** Rendered height in px; flags are drawn 4:3. */
  size = 14,
  title,
}: {
  code: string
  size?: number
  title?: string
}) {
  const [failed, setFailed] = useState(false)
  const label = title ?? flagName(code)

  if (failed || !code) {
    return (
      <span className="flag-code" title={label}>
        {code.toUpperCase()}
      </span>
    )
  }

  return (
    <img
      className="flag-icon"
      src={SOURCE(code, 40)}
      srcSet={`${SOURCE(code, 80)} 2x`}
      width={Math.round((size * 4) / 3)}
      height={size}
      // The country is always named or coded beside it, so the image itself is
      // decoration — announcing it again would read the flag out twice.
      alt=""
      title={label}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
