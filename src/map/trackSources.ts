import type { VesselProps } from '../types/gis'

/**
 * Where a position came from, and what that is worth.
 *
 * Two sources, because the console has two: the VTMIS over the VIS/PRISM
 * interface, and radar direct. The distinction is not bookkeeping — a VTMIS
 * track arrives already associated with a named vessel, having been through
 * that system's own tracker, while a radar contact is a measured position and
 * nothing else. The second is the more trustworthy *position* and the first is
 * the more trustworthy *identity*, which is exactly why the operator has to be
 * told which one they are looking at.
 */
export type Source = NonNullable<VesselProps['trackSource']>

export const SOURCES: Record<Source, { label: string; tone: 'ok' | 'warn'; hint: string }> = {
  vtmis: {
    label: 'VTMIS',
    tone: 'ok',
    hint: 'Over the VTMIS — the position came through the VIS/PRISM interface, already associated with this vessel by the VTMIS tracker. Identity and position together.',
  },
  radar: {
    label: 'RADAR',
    tone: 'warn',
    hint: 'Radar direct — the position is measured rather than reported, but the contact carries no name or IMO of its own. It is where something is, not who.',
  },
}

/** The associated track first; the bare contact second. */
export const SOURCE_ORDER: Source[] = ['vtmis', 'radar']

/**
 * What the feed says, or the VTMIS when it says nothing.
 *
 * Everything in this console arrives over the interface, so that is the honest
 * default rather than a shrug — and a track that comes in carrying its own
 * source overrides it without anything here changing.
 */
export function trackSourceOf(p: VesselProps): Source {
  return p.trackSource ?? 'vtmis'
}
