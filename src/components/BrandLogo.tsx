import { useState } from 'react'

/**
 * Candidate files, tried in order.
 *
 * Two of them because the mark is as likely to arrive as a PNG as an SVG, and
 * which one it is should not be a code change. SVG first: the header scales the
 * logo to a fixed height and a vector holds its edges at any device pixel ratio
 * where a small raster does not.
 */
const SOURCES = ['logo-fujairah-ports.svg', 'logo-fujairah-ports.png']

/**
 * The port authority's mark, at the head of the console.
 *
 * On a white plaque, and that is not decoration: the header is dark navy in
 * every theme and the published logo is dark navy on white, so laid straight
 * onto the chrome it would be very nearly invisible. A plaque is also how such a
 * mark is meant to be used — it carries a clear-space rule, and a panel is the
 * honest way to give it one without lightening the whole bar. A reversed
 * (white-on-transparent) version of the logo would be the other answer; if one
 * is supplied, drop the plaque's background and keep everything else.
 *
 * Falls back through the candidates and then renders nothing, rather than
 * leaving a broken-image glyph in the chrome. The title beside it already names
 * the port, so the header still reads correctly without the mark.
 */
export default function BrandLogo() {
  const [attempt, setAttempt] = useState(0)
  if (attempt >= SOURCES.length) return null

  return (
    <span className="app-brand">
      <img
        // `BASE_URL` rather than a rooted path, so the logo survives being
        // served from a sub-path the way the data files already do.
        src={`${import.meta.env.BASE_URL}${SOURCES[attempt]}`}
        alt="Fujairah Ports Authority"
        onError={() => setAttempt((a) => a + 1)}
      />
    </span>
  )
}
