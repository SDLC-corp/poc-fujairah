import type { CallPurpose, CargoKind, RequiredService } from '../types/gis'

/**
 * Option lists for the anchorage request form. Order is the order they appear
 * on the form, which follows the paper original.
 */

export interface CallPurposeOption {
  value: CallPurpose
  /** Short name, as the harbour uses it. */
  label: string
  /** Area codes the notice designates for this purpose, in preference order. */
  areas: string[]
  /** Shown when the anchorage dataset has not loaded yet. */
  blurb: string
}

/**
 * One option per area designation in Notice to Mariners No. 346, so choosing a
 * purpose says which anchorage the request is really asking for.
 */
export const CALL_PURPOSES: CallPurposeOption[] = [
  {
    value: 'awaiting-orders',
    label: 'Awaiting orders',
    areas: ['A'],
    blurb: 'Vessels awaiting orders or as directed by the Harbour Master.',
  },
  {
    value: 'waiting-berth',
    label: 'Waiting for berth',
    areas: ['W'],
    blurb: 'Inbound vessels awaiting berth, other than those calling SPM terminals.',
  },
  {
    value: 'bunkering',
    label: 'Bunkering & marine services',
    areas: ['BN', 'BS'],
    blurb: 'Bunkers, lube oil, de-sloping and other marine services.',
  },
  {
    value: 'marine-services',
    label: 'Marine services only',
    areas: ['C'],
    blurb: 'Marine services other than bunkers, lube oil or de-sloping.',
  },
  {
    value: 'hazardous-services',
    label: 'Hazardous / gas / chemical',
    areas: ['D'],
    blurb: 'Explosives, liquefied gas carriers and hazardous chemical tankers (IBC ch. 17).',
  },
  {
    value: 'lng-sts',
    label: 'LNG ship-to-ship',
    areas: ['G'],
    blurb: 'Liquefied gas carriers conducting ship-to-ship operations.',
  },
  {
    value: 'oil-sts',
    label: 'Oil tanker ship-to-ship',
    areas: ['S'],
    blurb: 'Oil tankers performing ship-to-ship operations.',
  },
  {
    value: 'spm',
    label: 'SPM terminal call',
    areas: ['T'],
    blurb: 'Tankers calling SPM terminals; bunkers, lube oil and de-sloping permitted.',
  },
  {
    value: 'naval',
    label: 'Naval visit',
    areas: ['N'],
    blurb: 'Navy vessels holding valid diplomatic clearance.',
  },
]

/** LOA above which the notice sends a vessel to the large-vessel anchorages. */
export const LARGE_VESSEL_M = 300
export const LARGE_VESSEL_AREAS = ['VN', 'VS']

/** Plain-language notes for terms the form uses without explaining. */
export const GLOSSARY: { term: string; meaning: string }[] = [
  {
    term: 'Harbour Master',
    meaning:
      'The official in charge of the port, responsible for daily operations, safety and ship traffic.',
  },
  { term: 'Bunkering', meaning: 'Refuelling a vessel.' },
  { term: 'De-sloping', meaning: 'Discharging oily residues and tank washings ashore.' },
  {
    term: 'STS',
    meaning: 'Ship-to-ship transfer — cargo moved directly between two vessels at anchor.',
  },
  {
    term: 'SPM',
    meaning:
      'Single point mooring — an offshore buoy a tanker moors to for loading or discharge by pipeline.',
  },
]

export const CARGO_KINDS: { value: CargoKind; label: string }[] = [
  { value: 'none', label: 'None / in ballast' },
  { value: 'liquid-bulk', label: 'Liquid bulk' },
  { value: 'dry-bulk', label: 'Dry bulk' },
  { value: 'gas', label: 'Gas' },
  { value: 'container', label: 'Container' },
  { value: 'general', label: 'General cargo' },
  { value: 'ro-ro', label: 'Ro-Ro' },
]

export interface ServiceOption {
  value: RequiredService
  label: string
  /** One line on what the agent is actually asking for. */
  hint: string
  /** Name from the Icon registry. */
  icon: string
}

/**
 * The notice separates services into two classes, and that separation decides
 * the anchorage: BN/BS take "bunkers, lube oil, de-sloping and other marine
 * services", while C takes marine services *other than* those three.
 */
export const BUNKER_SERVICES: ServiceOption[] = [
  { value: 'fuel', label: 'Bunkers', hint: 'Fuel oil delivered by barge', icon: 'fuel' },
  { value: 'lube-oil', label: 'Lube oil', hint: 'Lubricating oil supply', icon: 'lubeoil' },
  {
    value: 'de-sloping',
    label: 'De-sloping',
    hint: 'Oily residues and tank washings (Annex I)',
    icon: 'desloping',
  },
]

export const MARINE_SERVICES: ServiceOption[] = [
  { value: 'water', label: 'Fresh water', hint: 'Potable water by barge', icon: 'water' },
  { value: 'stores', label: 'Stores', hint: 'Provisions and spares', icon: 'stores' },
  { value: 'crew-change', label: 'Crew change', hint: 'Launch to and from shore', icon: 'crew' },
  { value: 'repairs', label: 'Repairs', hint: 'Riding squad or class survey', icon: 'repairs' },
  { value: 'tug', label: 'Tug', hint: 'Tug attendance or towage', icon: 'vessel' },
  { value: 'waste', label: 'Garbage', hint: 'Solid waste reception (Annex V)', icon: 'waste' },
]

/** Flat list, for storage and for anything that does not care about the split. */
export const REQUIRED_SERVICES: ServiceOption[] = [...BUNKER_SERVICES, ...MARINE_SERVICES]

/** The three the notice names explicitly — these force BN/BS over C. */
export const BUNKER_SERVICE_VALUES: RequiredService[] = BUNKER_SERVICES.map((s) => s.value)

export interface ServiceCheck {
  tone: 'alert' | 'info'
  message: string
}

/**
 * Cross-checks the requested services against the purpose of call. Area C is
 * defined as marine services *other than* bunkers, lube oil or de-sloping, so
 * asking for both is a contradiction the harbour master would bounce back.
 */
export function checkServices(
  purpose: CallPurpose,
  services: RequiredService[],
): ServiceCheck | null {
  const bunkerAsked = services.filter((s) => BUNKER_SERVICE_VALUES.includes(s))
  if (bunkerAsked.length === 0) return null

  const named = bunkerAsked
    .map((s) => BUNKER_SERVICES.find((b) => b.value === s)?.label ?? s)
    .join(', ')

  if (purpose === 'marine-services') {
    return {
      tone: 'alert',
      message: `Area C is for marine services other than bunkers, lube oil or de-sloping. ${named} would need Area BN or BS — change the purpose to “Bunkering & marine services”.`,
    }
  }
  if (purpose === 'awaiting-orders' || purpose === 'waiting-berth') {
    return {
      tone: 'info',
      message: `${named} is a bunkering service. Vessels taking it are normally directed to Area BN or BS rather than the waiting areas.`,
    }
  }
  return null
}

/** IMDG classes, for the hazardous-cargo follow-up. */
export const IMO_CLASSES = [
  '1 — Explosives',
  '2 — Gases',
  '3 — Flammable liquids',
  '4 — Flammable solids',
  '5 — Oxidising substances',
  '6 — Toxic / infectious',
  '7 — Radioactive',
  '8 — Corrosives',
  '9 — Miscellaneous',
]

export const PURPOSE_LABELS: Record<CallPurpose, string> = Object.fromEntries(
  CALL_PURPOSES.map((p) => [p.value, p.label]),
) as Record<CallPurpose, string>

export const PURPOSE_AREAS: Record<CallPurpose, string[]> = Object.fromEntries(
  CALL_PURPOSES.map((p) => [p.value, p.areas]),
) as Record<CallPurpose, string[]>

export const CARGO_LABELS: Record<CargoKind, string> = Object.fromEntries(
  CARGO_KINDS.map((c) => [c.value, c.label]),
) as Record<CargoKind, string>

export const SERVICE_LABELS: Record<RequiredService, string> = Object.fromEntries(
  REQUIRED_SERVICES.map((s) => [s.value, s.label]),
) as Record<RequiredService, string>

/**
 * Purposes that imply a specific destination. The Destination section is only
 * asked for when one of these is chosen.
 */
export const PURPOSES_NEEDING_DESTINATION: CallPurpose[] = ['waiting-berth', 'spm']
