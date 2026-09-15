import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import {
  selectAssignmentQueue,
  selectFreeSpots,
  selectPassageWay,
} from '../../features/analysis/selectors'
import type { AssignmentCandidate, SpotOption } from '../../features/analysis/selectors'
import { clearSelection, selectFeature } from '../../features/selection/selectionSlice'
import { startTransit } from '../../features/transit/transitSlice'
import { releaseSpot, RELEASE_REASONS } from '../../features/portData/portDataSlice'
import { cancelPicking, clearPick, startPicking } from '../../features/spots/spotsSlice'
import { distance, pointOnFeature } from '@turf/turf'
import {
  formatDateTime,
  formatDistance,
  formatDuration,
  formatLatLon,
  hoursSince,
} from '../../utils/format'
import { buildRoute } from '../../map/route'
import { VESSEL_LABELS } from '../../map/vesselTypes'
import AddVesselForm from '../AddVesselForm'
import RawJson from '../RawJson'
import SendAnchorPositionDialog from '../SendAnchorPositionDialog'
import type { AnchorNotice } from '../SendAnchorPositionDialog'

/** Closer and roomier scores higher; both are read straight off the geometry. */
function confidenceOf(option: SpotOption): number {
  const proximity = Math.max(0, 1 - option.distanceM / 30000)
  const roominess = Math.min(1, option.slackM / 300)
  return Math.round((0.6 * proximity + 0.4 * roominess) * 100)
}

/** The spot as the ship needs it: which water, and exactly where. */
function noticeFor(c: AssignmentCandidate, choice: SpotOption): AnchorNotice {
  return {
    vesselId: c.vessel.properties.id,
    vesselName: c.vessel.properties.name,
    areaCode: choice.areaCode,
    spotId: choice.spotId,
    coordinates: choice.coordinates,
  }
}

export default function AssignmentScreen() {
  const dispatch = useAppDispatch()
  const queue = useAppSelector(selectAssignmentQueue)
  const passage = useAppSelector(selectPassageWay)
  const [confirming, setConfirming] = useState<AssignmentCandidate | null>(null)
  /**
   * Whether to draft the master's notice on confirming. On by default: the
   * assignment is only useful once the ship has it, and the operator who does
   * not want to send one has to say so rather than simply forget.
   */
  const [tellMaster, setTellMaster] = useState(true)
  /**
   * The confirmed assignment held open for the notice, snapshotted rather than
   * looked up: by the time the mail is composed she is already under way to it.
   */
  const [notice, setNotice] = useState<AnchorNotice | null>(null)
  /** Who the position went to, per vessel, so the panel can say it was sent. */
  const [sentTo, setSentTo] = useState<Record<string, string>>({})
  /**
   * The move held back while the notice is on screen.
   *
   * She sails the moment the assignment is confirmed, which is right — but the
   * passage down the Passage Way and the anchor going down are worth watching,
   * and behind a modal nobody sees either. So the transit waits for the dialog
   * to go, whether it went with the mail or without it.
   */
  const [pendingMove, setPendingMove] = useState<Parameters<typeof startTransit>[0] | null>(
    null,
  )

  /** Lets go of the held move — called however the notice was dismissed. */
  function sail() {
    if (!pendingMove) return
    dispatch(startTransit(pendingMove))
    setPendingMove(null)
  }
  const [picked, setPicked] = useState<Record<string, SpotOption>>({})
  const [manual, setManual] = useState<Record<string, SpotOption>>({})
  const [assigned, setAssigned] = useState<Record<string, SpotOption>>({})
  const freeSpots = useAppSelector(selectFreeSpots)
  const pickingFor = useAppSelector((s) => s.spots.pickingFor)
  const pickedSpots = useAppSelector((s) => s.spots.picked)
  const vessels = useAppSelector((s) => s.portData.vessels)
  const releases = useAppSelector((s) => s.portData.releases)
  const selected = useAppSelector((s) => s.selection.selected)

  /**
   * The occupied spot under the operator's cursor.
   *
   * There is no separate "occupied spot" object to click — a taken spot *is* a
   * vessel lying at anchor, and clicking her on the map already selects her. So
   * the panel keys off that selection rather than inventing a second way to
   * point at the same water.
   */
  const occupant =
    selected?.layer === 'vessels'
      ? (vessels?.features.find(
          (v) =>
            v.properties.id === selected.id &&
            (v.properties.status === 'anchored' || v.properties.status === 'moored'),
        ) ?? null)
      : null

  const [releasing, setReleasing] = useState(false)
  const [reason, setReason] = useState<string>(RELEASE_REASONS[0])
  const [note, setNote] = useState('')
  // "Other" says nothing on its own, so it has to be written out.
  const reasonComplete = reason !== 'Other' || note.trim().length > 0

  function closeRelease() {
    setReleasing(false)
    setReason(RELEASE_REASONS[0])
    setNote('')
  }

  /** Turn a free spot clicked on the map into the same shape the allocator emits. */
  const fromMap = (c: AssignmentCandidate): SpotOption | null => {
    const spotId = pickedSpots[c.vessel.properties.id]
    if (!spotId) return null
    const spot = freeSpots.features.find((f) => f.properties.id === spotId)
    if (!spot) return null
    const centre = pointOnFeature(spot).geometry.coordinates as [number, number]
    return {
      spotId,
      areaCode: spot.properties.area,
      coordinates: centre,
      distanceM: distance(c.vessel, centre, { units: 'kilometers' }) * 1000,
      slackM: Math.round(spot.properties.radiusM - c.requiredRadiusM),
    }
  }

  const choiceFor = (c: AssignmentCandidate) => {
    const id = c.vessel.properties.id
    // A spot chosen on the map is the most explicit instruction there is, so it
    // outranks the area override and the alternatives.
    return assigned[id] ?? fromMap(c) ?? manual[id] ?? picked[id] ?? c.recommended
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

      {/* ---- the spot the operator just clicked, if somebody is on it ---- */}
      {occupant && (
        <section className="panel occupied-panel">
          <h2>
            Occupied spot
            <span className="pill pill-anchored">
              Area {occupant.properties.area ?? '—'}
            </span>
          </h2>
          <p className="muted">
            <strong>{occupant.properties.name}</strong> ·{' '}
            {VESSEL_LABELS[occupant.properties.type]} · {occupant.properties.lengthM} m LOA
          </p>
          <dl className="kv kv-wide">
            <div>
              <dt>Anchored for</dt>
              <dd>{formatDuration(hoursSince(occupant.properties.ata))}</dd>
            </div>
            <div>
              <dt>Arrived</dt>
              <dd>{formatDateTime(occupant.properties.ata)}</dd>
            </div>
            <div className="kv-span">
              <dt>Position</dt>
              <dd>
                {occupant.geometry.coordinates[1].toFixed(5)}°N,{' '}
                {occupant.geometry.coordinates[0].toFixed(5)}°E
              </dd>
            </div>
          </dl>
          <div className="spot-actions">
            <button type="button" className="primary-button" onClick={() => setReleasing(true)}>
              Release spot
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => dispatch(clearSelection())}
            >
              Deselect
            </button>
          </div>
          <p className="muted hint">
            Releasing frees the water for the allocator and puts her back in the queue below.
          </p>
        </section>
      )}

      <section className="panel">
        <h2>
          Awaiting assignment<span className="badge badge-ok">{queue.length}</span>
        </h2>
        <p className="muted">
          Each vessel is matched to a free spot in an area the notice designates for it, big enough
          for its swing circle, and nearest to where it is now waiting.
        </p>
        <p className="muted hint">
          Click an occupied spot on the map — the vessel or the circle she is swinging in — to give
          that water up again.
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
                {/* ---- work the spot on the map ---- */}
                <div className={`spot-actions${pickingFor === p.id ? ' picking' : ''}`}>
                 
                  {pickingFor === p.id ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => dispatch(cancelPicking())}
                    >
                      Cancel pick
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={isAssigned}
                      onClick={() => dispatch(startPicking(p.id))}
                    >
                      Choose spot on map
                    </button>
                  )}
                  {pickedSpots[p.id] && (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={isAssigned}
                      onClick={() => dispatch(clearPick(p.id))}
                    >
                      Use suggestion
                    </button>
                  )}
                </div>

                {pickingFor === p.id && (
                  <p className="notice-callout">
                    Click a green free spot on the map to assign it to {p.name}.
                  </p>
                )}
                {pickedSpots[p.id] && pickingFor !== p.id && (
                  <p className="muted hint">Spot chosen from the map.</p>
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
            {/* Reachable after the fact too — a notice that went to the wrong
                address, or was skipped at confirmation, still has to go. */}
            {isAssigned && choice && (
              <>
                <button
                  type="button"
                  className="ghost-button notice-again"
                  onClick={() => setNotice(noticeFor(c, choice))}
                >
                  {sentTo[p.id] ? 'Send position again' : 'Send position to master'}
                </button>
                {sentTo[p.id] && (
                  <p className="muted hint">Position sent to {sentTo[p.id]}.</p>
                )}
              </>
            )}
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
              {choiceFor(confirming)?.spotId})?
            </p>

            {/* The coordinates are shown before confirming, not after: this is
                the figure that goes to the ship, and it is the last moment it
                can be checked against the chart. */}
            {(() => {
              const choice = choiceFor(confirming)
              if (!choice) return null
              const [lon, lat] = choice.coordinates
              return (
                <dl className="kv kv-wide confirm-spot">
                  <div className="kv-span">
                    <dt>Anchor position</dt>
                    <dd>
                      <strong>{formatLatLon(lat, lon)}</strong>
                      <small className="muted">
                        {lat.toFixed(5)}°N, {lon.toFixed(5)}°E
                      </small>
                    </dd>
                  </div>
                  <div>
                    <dt>Swing radius</dt>
                    <dd>{confirming.requiredRadiusM} m</dd>
                  </div>
                  <div>
                    <dt>Distance to run</dt>
                    <dd>{formatDistance(choice.distanceM)}</dd>
                  </div>
                </dl>
              )
            })()}

            <label className="share-include confirm-notify">
              <input
                type="checkbox"
                checked={tellMaster}
                onChange={(e) => setTellMaster(e.target.checked)}
              />
              Email the position to the master
            </label>
            <p className="muted hint">
              {tellMaster
                ? 'Asks for the address, then sends her the coordinates above.'
                : 'The spot is held for her, but nobody aboard is told where it is.'}
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
                    const move = {
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
                    }
                    if (tellMaster) {
                      // Held until the notice is off the screen, so the passage
                      // and the anchor going down are actually seen.
                      setNotice(noticeFor(confirming, choice))
                      setPendingMove(move)
                    } else {
                      dispatch(startTransit(move))
                    }
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

      {notice && (
        <SendAnchorPositionDialog
          notice={notice}
          onSend={(to) => {
            setSentTo((prev) => ({ ...prev, [notice.vesselId]: to }))
            setNotice(null)
            sail()
          }}
          onClose={() => {
            setNotice(null)
            // She sails whether or not the mail went — the spot is hers either
            // way, and a vessel stuck in the queue because the operator closed
            // a dialog would be a bug wearing a sensible face.
            sail()
          }}
        />
      )}

      {releasing && occupant && (
        <div className="dialog" role="dialog" aria-modal="true" aria-label="Release spot">
          <div className="dialog-card">
            <h3>Release spot</h3>
            <p>
              Give up the water <strong>{occupant.properties.name}</strong> is lying in
              {occupant.properties.area ? ` in Area ${occupant.properties.area}` : ''}. She returns
              to the waiting queue and the spot becomes available to the allocator at once.
            </p>

            <label className="field">
              <span>
                Reason <em className="req">*</em>
              </span>
              <select
                className="text-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {RELEASE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>
                Note {reason === 'Other' && <em className="req">*</em>}
              </span>
              <textarea
                className="text-input"
                rows={3}
                maxLength={200}
                placeholder={
                  reason === 'Other'
                    ? 'Say what happened — this is the only record of it.'
                    : 'Optional detail for the log'
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <small className="muted field-note">
                Recorded against the release with the time and the operator.
              </small>
            </label>

            <div className="dialog-actions">
              <button type="button" className="ghost-button" onClick={closeRelease}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!reasonComplete}
                onClick={() => {
                  dispatch(
                    releaseSpot({
                      vesselId: occupant.properties.id,
                      reason,
                      note,
                    }),
                  )
                  // The vessel is no longer on that spot, so a card still
                  // describing her there would be describing nothing.
                  dispatch(clearSelection())
                  closeRelease()
                }}
              >
                Release spot
              </button>
            </div>
          </div>
        </div>
      )}

      {releases.length > 0 && (
        <section className="panel panel-wide">
          <h2>
            Released spots
            <span className="badge badge-ok">{releases.length}</span>
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Vessel</th>
                <th>Area</th>
                <th>Reason</th>
                <th>Released</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => (
                <tr key={r.id}>
                  <td>
                    <code className="ref-cell">{r.id}</code>
                  </td>
                  <td>
                    <strong>{r.vesselName}</strong>
                  </td>
                  <td>{r.areaCode ?? '—'}</td>
                  <td>
                    {r.reason}
                    {r.note && <small className="muted release-note">{r.note}</small>}
                  </td>
                  <td className="muted">{formatDateTime(r.at)}</td>
                  <td className="muted">{r.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <RawJson label="POST /api/anchorage/assignments" data={payload} />
    </>
  )
}
