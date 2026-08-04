import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { selectAssignmentQueue, selectPassageWay } from '../../features/analysis/selectors'
import type { AssignmentCandidate, SpotOption } from '../../features/analysis/selectors'
import { selectFeature } from '../../features/selection/selectionSlice'
import { startTransit } from '../../features/transit/transitSlice'
import { formatDateTime, formatDistance } from '../../utils/format'
import { buildRoute } from '../../map/route'
import { VESSEL_LABELS } from '../../map/vesselTypes'
import AddVesselForm from '../AddVesselForm'
import RawJson from '../RawJson'

/** Closer and roomier scores higher; both are read straight off the geometry. */
function confidenceOf(option: SpotOption): number {
  const proximity = Math.max(0, 1 - option.distanceM / 30000)
  const roominess = Math.min(1, option.slackM / 300)
  return Math.round((0.6 * proximity + 0.4 * roominess) * 100)
}

export default function AssignmentScreen() {
  const dispatch = useAppDispatch()
  const queue = useAppSelector(selectAssignmentQueue)
  const passage = useAppSelector(selectPassageWay)
  const [confirming, setConfirming] = useState<AssignmentCandidate | null>(null)
  const [picked, setPicked] = useState<Record<string, SpotOption>>({})
  const [manual, setManual] = useState<Record<string, SpotOption>>({})
  const [assigned, setAssigned] = useState<Record<string, SpotOption>>({})

  const choiceFor = (c: AssignmentCandidate) => {
    const id = c.vessel.properties.id
    return assigned[id] ?? manual[id] ?? picked[id] ?? c.recommended
  }

  const payload = {
    requestedAt: '2026-08-03T09:15:00Z',
    engine: { name: 'spot-allocator', version: '2.0.0', strategy: 'area-suitability + nearest-fit' },
    queue: queue.map((c) => {
      const choice = choiceFor(c)
      return {
        vesselId: c.vessel.properties.id,
        vessel: c.vessel.properties.name,
        type: c.vessel.properties.type,
        loaM: c.vessel.properties.lengthM,
        eta: c.vessel.properties.eta,
        requiredSwingRadiusM: c.requiredRadiusM,
        recommendation: c.recommended && {
          spotId: c.recommended.spotId,
          area: c.recommended.areaCode,
          distanceM: Math.round(c.recommended.distanceM),
          slackM: c.recommended.slackM,
          confidence: confidenceOf(c.recommended) / 100,
        },
        alternatives: c.alternatives.map((a) => ({ spotId: a.spotId, area: a.areaCode })),
        fullAreas: c.fullAreas,
        assignedSpot: assigned[c.vessel.properties.id]?.spotId ?? null,
        selectedSpot: choice?.spotId ?? null,
        decidedBy: manual[c.vessel.properties.id] || picked[c.vessel.properties.id] ? 'operator' : 'engine',
        designatedAreas: c.designatedAreas,
      }
    }),
  }

  return (
    <>
      <AddVesselForm />

      <section className="panel">
        <h2>
          Awaiting assignment<span className="badge badge-ok">{queue.length}</span>
        </h2>
        <p className="muted">
          Each vessel is matched to a free spot in an area the notice designates for it, big enough
          for its swing circle, and nearest to where it is now waiting.
        </p>
      </section>

      {queue.map((c) => {
        const p = c.vessel.properties
        const choice = choiceFor(c)
        const isAssigned = Boolean(assigned[p.id])
        const isManual = Boolean(picked[p.id]) || Boolean(manual[p.id])
        const confidence = choice ? confidenceOf(choice) : 0
        const offDesignation = Boolean(choice && !c.designatedAreas.includes(choice.areaCode))

        return (
          <section className="panel" key={p.id}>
            <div className="assign-head">
              <div>
                <button
                  type="button"
                  className="link-cell"
                  onClick={() => dispatch(selectFeature({ layer: 'vessels', id: p.id }))}
                >
                  <strong>{p.name}</strong>
                </button>
                <span className="muted">
                  {VESSEL_LABELS[p.type]} · {p.lengthM} m LOA · needs {c.requiredRadiusM} m swing
                </span>
              </div>
              <span className="pill pill-awaiting">ETA {formatDateTime(p.eta)}</span>
            </div>

            {choice ? (
              <div className="recommend">
                <div className="recommend-head">
                  <span className={`source-tag ${isManual ? 'source-manual' : 'source-ai'}`}>
                    {isAssigned ? 'Assigned' : isManual ? 'Manual' : 'AI suggestion'}
                  </span>
                  <strong>Area {choice.areaCode}</strong>
                  <span
                    className={`conf conf-${
                      confidence > 75 ? 'high' : confidence > 50 ? 'mid' : 'low'
                    }`}
                  >
                    {confidence}% match
                  </span>
                </div>
                <p className="muted">
                  {formatDistance(choice.distanceM)} away · {choice.slackM} m spare radius · spot{' '}
                  {choice.spotId}
                  {c.fullAreas.length > 0 && ` · full: ${c.fullAreas.join(', ')}`}
                </p>
                {offDesignation && (
                  <p className="override-warning">
                    Area {choice.areaCode} is not designated for a{' '}
                    {VESSEL_LABELS[p.type].toLowerCase()} — operator override.
                  </p>
                )}
                <label className="manual-pick">
                  <span>Manual override</span>
                  <select
                    value={choice.areaCode}
                    onChange={(e) => {
                      const option = c.areaOptions.find((o) => o.areaCode === e.target.value)
                      if (!option) return
                      setManual((prev) => ({ ...prev, [p.id]: option }))
                      setPicked((prev) => {
                        const next = { ...prev }
                        delete next[p.id]
                        return next
                      })
                    }}
                    disabled={isAssigned}
                  >
                    {c.areaOptions.map((option) => (
                      <option key={option.spotId} value={option.areaCode}>
                        Area {option.areaCode}
                        {c.designatedAreas.includes(option.areaCode) ? '' : ' — not designated'} ·{' '}
                        {formatDistance(option.distanceM)}
                      </option>
                    ))}
                  </select>
                </label>

                {c.alternatives.length > 0 && (
                  <div className="filter-row">
                    <button
                      type="button"
                      className={`filter-chip${choice === c.recommended ? ' active' : ''}`}
                      onClick={() => {
                        setPicked((prev) => {
                          const next = { ...prev }
                          delete next[p.id]
                          return next
                        })
                        setManual((prev) => {
                          const next = { ...prev }
                          delete next[p.id]
                          return next
                        })
                      }}
                    >
                      {c.recommended?.areaCode}
                    </button>
                    {c.alternatives.map((alt) => (
                      <button
                        key={alt.spotId}
                        type="button"
                        className={`filter-chip${choice.spotId === alt.spotId ? ' active' : ''}`}
                        onClick={() => {
                          setPicked((prev) => ({ ...prev, [p.id]: alt }))
                          setManual((prev) => {
                            const next = { ...prev }
                            delete next[p.id]
                            return next
                          })
                        }}
                      >
                        {alt.areaCode}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="muted">
                No free spot in any area designated for this vessel
                {c.fullAreas.length > 0 && ` (${c.fullAreas.join(', ')} full)`}.
              </p>
            )}

            <button
              type="button"
              className="primary-button"
              disabled={!choice || isAssigned}
              onClick={() => setConfirming(c)}
            >
              {!choice
                ? 'No spot available'
                : isAssigned
                  ? `Assigned to Area ${choice.areaCode}`
                  : `Assign Area ${choice.areaCode}`}
            </button>
          </section>
        )
      })}

      {confirming && (
        <div className="dialog" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <h3>Confirm assignment</h3>
            <p>
              Assign <strong>{confirming.vessel.properties.name}</strong> to{' '}
              <strong>Area {choiceFor(confirming)?.areaCode}</strong> (spot{' '}
              {choiceFor(confirming)?.spotId})? The master and the VTS operator are notified.
            </p>
            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const choice = choiceFor(confirming)
                  if (choice) {
                    const p = confirming.vessel.properties
                    setAssigned((prev) => ({ ...prev, [p.id]: choice }))
                    // Walk the vessel to its spot on the map rather than teleporting it.
                    dispatch(
                      startTransit({
                        vesselId: p.id,
                        name: p.name,
                        from: confirming.vessel.geometry.coordinates as [number, number],
                        to: choice.coordinates,
                        // Inbound traffic joins the Passage Way rather than
                        // cutting across the occupied anchorages.
                        path: buildRoute(
                          confirming.vessel.geometry.coordinates,
                          choice.coordinates,
                          passage,
                        ) as [number, number][],
                        spotId: choice.spotId,
                        areaCode: choice.areaCode,
                      }),
                    )
                  }
                  setConfirming(null)
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <RawJson label="POST /api/anchorage/assignments" data={payload} />
    </>
  )
}
