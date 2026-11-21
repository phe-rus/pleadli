/** Which kind of institution may post which kind of package to which, as far as the relay can verify.
 *
 * The relay never opens a package. It cannot see a signature or a case. What it can verify is what the
 * Pleadli licence says each address is: a police station, a DPP office, a court, a prison, a law firm. That is
 * enough to refuse a post that no institution of that kind has any path to send, before it is stored.
 *
 * This is the SECOND of two checks, and the weaker one. The receiving application repeats the check on its own
 * machine against the sender kind inside the signed package (packages/interchange/src/authorization.rs), then
 * verifies the signature, the trusted link and the content. A client that skips this server, or a relay that
 * were wrong, still cannot make an application accept what its table refuses. `tests/relay-paths.test.ts`
 * fails if this list and the Rust one ever disagree.
 *
 * Adding a path means adding a line here AND in authorization.rs, with the law or procedure that allows it. */

export type InstitutionType = 'police' | 'dpp' | 'courts' | 'prisons' | 'lawyers'

/** [from, to, kind] */
export const RELAY_PATHS: ReadonlyArray<readonly [InstitutionType, InstitutionType, string]> = [
  ['police', 'dpp', 'referral'],
  ['dpp', 'police', 'receipt'],
  ['dpp', 'police', 'decision_notice'],
  ['dpp', 'courts', 'case_filing'],
  ['dpp', 'courts', 'case_withdrawal'],
  ['courts', 'dpp', 'filing_receipt'],
  ['courts', 'lawyers', 'court_notice'],
  ['lawyers', 'courts', 'court_notice_receipt'],
  ['lawyers', 'courts', 'firm_filing'],
  ['courts', 'lawyers', 'firm_filing_receipt'],
  ['courts', 'prisons', 'custody_order'],
  ['prisons', 'courts', 'custody_receipt'],
  ['prisons', 'courts', 'custody_report'],
]

const PAIRING = new Set(['pairing_invite', 'pairing_response', 'pairing_confirmation'])

/** True when the two kinds of institution have at least one implemented path, in either direction. */
export function relayPairAllowed(a: string | undefined, b: string | undefined) {
  return RELAY_PATHS.some(([from, to]) => (from === a && to === b) || (from === b && to === a))
}

export function relayPermitted(from: string | undefined, to: string | undefined, kind: string) {
  if (PAIRING.has(kind)) return relayPairAllowed(from, to)
  return RELAY_PATHS.some(([f, t, k]) => f === from && t === to && k === kind)
}
