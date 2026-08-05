/**
 * How the console describes anchorage load. Kept in one place so the header
 * meter, the KPI strip and the dashboard panel can never disagree about when
 * the anchorage is "busy".
 */

/** Overall utilisation at which the anchorage reads as busy. */
export const OCCUPANCY_BUSY_PCT = 70
/** Overall utilisation at which it reads as critical. */
export const OCCUPANCY_CRITICAL_PCT = 85
/** Threshold at which a single area raises an occupancy warning. */
export const OCCUPANCY_ALERT_PCT = 80

export type LoadTone = 'ok' | 'warn' | 'alert'

export interface LoadState {
  /** Modifier class applied to the meter. */
  className: string
  /** Written state, so the meter never depends on hue alone. */
  label: string
  tone: LoadTone
}

export function utilisationLoad(pct: number): LoadState {
  if (pct >= OCCUPANCY_CRITICAL_PCT) {
    return { className: 'meter-crit', label: 'Critical', tone: 'alert' }
  }
  if (pct >= OCCUPANCY_BUSY_PCT) {
    return { className: 'meter-warn', label: 'Busy', tone: 'warn' }
  }
  return { className: '', label: 'Normal', tone: 'ok' }
}
