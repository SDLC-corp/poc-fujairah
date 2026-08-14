import { useMemo } from 'react'
import { useAppSelector } from '../app/hooks'
import { buildCompassRose, COMPASS_INK } from '../map/compassRose'

/** The halo the map's own labels are set in, so the rose's numbers match. */
const LABEL_HALO = '#f8fafc'

/**
 * The chart rose, pinned to the top right of the map pane and drawn as the
 * sheet draws it: one ring graduated every degree and numbered every ten, an
 * open leaf at true north, and the variation written up the meridian. Only the
 * rotation comes from the map — the camera's bearing is turned back out of it
 * so 000 always points at true north on screen, which is the one thing an
 * operator reads it for once the view has been swung off north-up.
 */
export default function CompassRose() {
  const visible = useAppSelector((s) => s.layers.visible.compass)
  const bearing = useAppSelector((s) => s.view.bearing)
  // The rose moves only with the magnetic model, so it is built once a session.
  const rose = useMemo(() => buildCompassRose(), [])

  if (!visible) return null

  const { radius, extent, ticksOne, ticksFive, ticksTen, labels } = rose
  const { pointerSolid, pointerOpen, magneticNorth, variationText } = rose

  return (
    <svg
      className="compass-rose"
      viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
      width={extent * 2}
      height={extent * 2}
      role="img"
      aria-label={`Compass rose, variation ${variationText}`}
    >
      <g transform={`rotate(${-bearing})`} stroke={COMPASS_INK} fill="none">
        {/* The meridian, and the point the whole rose is set from. */}
        <line x1={0} y1={-radius} x2={0} y2={radius} strokeWidth={0.5} strokeDasharray="1 2.5" />
        <circle r={2.4} strokeWidth={0.6} />
        <circle r={0.7} fill={COMPASS_INK} stroke="none" />

        <circle r={radius} strokeWidth={0.9} />
        <path d={ticksOne} strokeWidth={0.3} />
        <path d={ticksFive} strokeWidth={0.55} />
        <path d={ticksTen} strokeWidth={0.9} />

        {/* Half solid, half open, as a compass needle is drawn. */}
        <polygon points={pointerOpen} strokeWidth={0.7} strokeLinejoin="round" />
        <polygon points={pointerSolid} fill={COMPASS_INK} strokeWidth={0.7} strokeLinejoin="round" />

        {/* Magnetic north dashed — it is where the compass points, not where
            north is. Two degrees off true, so it runs close enough to the
            meridian to pass through the needle: drawn last, so what clears the
            solid half still shows rather than being painted over. */}
        <line
          x1={0}
          y1={0}
          x2={magneticNorth.x}
          y2={magneticNorth.y}
          strokeWidth={0.6}
          strokeDasharray="3 2"
        />

        {/* Variation up the meridian, as the sheet writes it. Inside the
            rotating group: it is a note on the rose, so it turns with it. */}
        <text
          transform="rotate(-90)"
          x={radius * 0.3}
          y={-2.6}
          fill={COMPASS_INK}
          stroke={LABEL_HALO}
          strokeWidth={2}
          paintOrder="stroke"
          fontSize={6.5}
          fontWeight={600}
          letterSpacing={0.2}
          textAnchor="middle"
        >
          {variationText}
        </text>

        {/* The numbers stand outside the ring, and carry the halo every other
            label on this map does — otherwise they are lost the moment one
            lands on a dark area fill. */}
        {labels.map((l) => (
          <text
            key={l.text}
            x={l.x}
            y={l.y}
            transform={`rotate(${l.rotate} ${l.x} ${l.y})`}
            fill={COMPASS_INK}
            stroke={LABEL_HALO}
            strokeWidth={1.5}
            paintOrder="stroke"
            fontSize={6.5}
            fontWeight={600}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {l.text}
          </text>
        ))}
      </g>
    </svg>
  )
}
