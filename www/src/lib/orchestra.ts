/** Rules shared by the Orchestra pages and the staff admin
 * (docs/platform/ORCHESTRA-PLAN.md). */

export const APPLICATIONS = ['police', 'dpp', 'courts', 'lawyers', 'prisons'] as const
export type Application = (typeof APPLICATIONS)[number]

/** The word an address uses for each kind of institution: ug.police..., ug.dpp...,
 * ug.court..., ug.prisons..., ug.advocate... */
const ADDRESS_WORD: Record<string, string> = { police: 'police', dpp: 'dpp', courts: 'court', prisons: 'prisons', lawyers: 'advocate' }

/** Words that say nothing about which office it is, dropped from addresses. */
const FILLER = new Set(['the', 'of', 'and', 'uganda', 'police', 'dpp', 'odpp', 'force', 'station', 'region', 'regional', 'district', 'office', 'directorate', 'public', 'prosecutions', 'prisons', 'prison', 'service', 'court', 'chambers', 'advocates', 'advocate', 'law', 'firm', 'co', 'ltd'])

export function slugPart(name: string) {
  const words = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
  const kept = words.filter((w) => !FILLER.has(w))
  return (kept.length ? kept : words).join('-').slice(0, 40)
}

/** A suggested Orchestra address: country.institution.place. Staff confirm or
 * change it when approving; once issued it never changes. */
export function suggestAddress(country: string, institutionType: string, name: string) {
  return [country.toLowerCase(), ADDRESS_WORD[institutionType] ?? institutionType, slugPart(name)].join('.')
}

export const ADDRESS_PATTERN = /^[a-z]{2}(\.[a-z0-9]+(-[a-z0-9]+)*){2,3}$/

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A licence key a person can read out and type: PLD-XXXX-XXXX-XXXX-XXXX. */
export function newLicenceKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const chars = [...bytes].map((b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('')
  return `PLD-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`
}

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim().toUpperCase()))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const DAY = 86_400_000
export const TRIAL_DAYS = 30
