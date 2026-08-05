/**
 * Flag states an agent is realistically going to file at Fujairah: the major
 * open registries, the Gulf states, and the large national fleets. ISO 3166-1
 * alpha-2, which is what the AIS feed carries.
 */
export interface FlagState {
  code: string
  name: string
}

/** The home flag leads; the rest are alphabetical by country name. */
export const FLAG_STATES: FlagState[] = [
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'AG', name: 'Antigua & Barbuda' },
  { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BB', name: 'Barbados' },
  { code: 'BM', name: 'Bermuda' },
  { code: 'BR', name: 'Brazil' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'CN', name: 'China' },
  { code: 'CK', name: 'Cook Islands' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EG', name: 'Egypt' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GI', name: 'Gibraltar' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'LR', name: 'Liberia' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PA', name: 'Panama' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PT', name: 'Portugal' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RU', name: 'Russia' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'KR', name: 'South Korea' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TR', name: 'Türkiye' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'VN', name: 'Vietnam' },
]

const BY_CODE = new Map(FLAG_STATES.map((f) => [f.code, f.name]))

/** Country name for a flag code, falling back to the code itself. */
export function flagName(code: string): string {
  return BY_CODE.get(code.toUpperCase()) ?? code
}
