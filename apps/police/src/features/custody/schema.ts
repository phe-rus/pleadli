import * as m from '@/paraglide/messages'
import * as z from 'zod'

// The five statuses below are exactly the decision points
// docs/police/research/custody-and-bonds.md verified against the Police
// Act (release without charge, release on bond, production in court,
// referral to DPP, or continued custody bounded by the deadline) — not
// invented.
export const custodyStatuses = [
  { value: 'in_custody', get label() { return m["custody.status.in_custody"]() } },
  { value: 'released_no_charge', get label() { return m["custody.status.released_without_charge"]() } },
  { value: 'released_on_bond', get label() { return m["custody.status.released_on_bond"]() } },
  { value: 'produced_in_court', get label() { return m["custody.status.produced_in_court"]() } },
  { value: 'remanded', get label() { return m["custody.status.remanded"]() } },
  { value: 'referred_to_dpp', get label() { return m["custody.status.referred_to_dpp"]() } },
] as const

export function custodyStatusLabel(status: string) {
  return custodyStatuses.find((s) => s.value === status)?.label ?? status
}

export const custodyRecordSchema = z.object({
  id: z.string(),
  personId: z.string(),
  personFirstName: z.string(),
  personLastName: z.string(),
  personOtherNames: z.string().nullable(),
  incidentId: z.string().nullable(),
  caseId: z.string().nullable(),
  caseReference: z.string().nullable(),
  arrestedAt: z.number(),
  location: z.string().nullable(),
  crossJurisdictionTransfer: z.boolean(),
  transferredAt: z.number().nullable(),
  status: z.string(),
  releasedAt: z.number().nullable(),
  notes: z.string().nullable(),
  legalAccess: z.string().nullable(),
  legalName: z.string().nullable(),
  legalRequestedAt: z.number().nullable(),
  legalNote: z.string().nullable(),
  createdAt: z.number(),
})

export type CustodyRecord = z.infer<typeof custodyRecordSchema>

export const createCustodyRecordSchema = z.object({
  personId: z.string().min(1, { error: () => m["validation.person_is_required"]() }),
  incidentId: z.string().nullable(),
  caseId: z.string().nullable(),
  arrestedAt: z.number(),
  location: z.string(),
  crossJurisdictionTransfer: z.boolean(),
  transferredAt: z.number().nullable(),
  status: z.string().min(1, { error: () => m["validation.status_is_required"]() }),
  releasedAt: z.number().nullable(),
  notes: z.string(),
  legalAccess: z.string().nullable(),
  legalName: z.string(),
  legalRequestedAt: z.number().nullable().optional(),
  legalNote: z.string().nullable().optional(),
})

export type CreateCustodyRecordInput = z.infer<typeof createCustodyRecordSchema>

/** How a person in custody reached, or did not reach, a lawyer. It is a record kept at the station; nothing is sent. */
export const legalAccessKinds = ["own_advocate", "legal_aid", "duty_counsel", "declined", "not_yet_asked"] as const
export const legalAccessNeedsName = (kind: string | null) => kind === "own_advocate" || kind === "legal_aid" || kind === "duty_counsel"
export const legalAccessLabel = (kind: string) => (m as unknown as Record<string, () => string>)[`custody.legal.${kind}`]?.() ?? kind

export function custodyPersonName(record: CustodyRecord) {
  return [record.personLastName, record.personFirstName, record.personOtherNames].filter(Boolean).join(', ')
}

const HOUR_MS = 60 * 60 * 1000

/** The two limits custody is counted against. They come from the legal rules in force and are set
 * when those load (see features/rules); these are the values until then. */
let limitHours = 48
let transferWindowDays: number | null = 7
/** The limits for words (a message names the number of hours and days) and for the form: `days` is null in a country whose rules have no transfer window. */
export const custodyLimits = () => ({ hours: limitHours, days: transferWindowDays ?? 0, hasTransferWindow: transferWindowDays !== null })
export function setCustodyLimits(limits: { hours?: number | null; transferDays?: number | null }) {
  limitHours = limits.hours && limits.hours > 0 ? limits.hours : 48
  transferWindowDays = limits.transferDays && limits.transferDays > 0 ? limits.transferDays : null
}

export type CustodyCompliance = {
  /** The deadline actually binding right now, and what it's measured
   * against — per the research, verified for the two non-transfer states,
   * inferred (not independently confirmed) for the post-transfer case. */
  deadline: number
  basis: 'arrest+48h' | 'transfer-window+7d' | 'post-transfer+48h (inferred)'
  hoursRemaining: number
  isOverdue: boolean
}

/**
 * Derived, never stored — docs/police/PRODUCT.md is explicit that 48h
 * compliance must come from underlying timestamps, not a maintained flag.
 *
 * Grounded in docs/police/research/custody-and-bonds.md:
 * - Normal case: 48h from arrest (Constitution Art. 23(4) / Police Act
 *   s.25(1) — verified against primary source).
 * - Cross-jurisdiction case, not yet transferred: the binding constraint is
 *   the 7-day transfer window (Police Act s.25(2) — verified), not the 48h,
 *   since the 48h clock "does not apply until transferred."
 * - Cross-jurisdiction case, already transferred: the research did not
 *   state whether a fresh 48h then starts — this function assumes it does
 *   (the most natural reading), but that specific assumption is NOT
 *   independently verified. Flagged in `basis` so the UI can show it's an
 *   inference, not a confirmed rule.
 */
export function custodyCompliance(record: Pick<CustodyRecord, 'arrestedAt' | 'crossJurisdictionTransfer' | 'transferredAt'>): CustodyCompliance {
  let deadline: number
  let basis: CustodyCompliance['basis']

  if (!record.crossJurisdictionTransfer || transferWindowDays === null) {
    deadline = record.arrestedAt + limitHours * HOUR_MS
    basis = 'arrest+48h'
  } else if (!record.transferredAt) {
    deadline = record.arrestedAt + (transferWindowDays ?? 0) * 24 * HOUR_MS
    basis = 'transfer-window+7d'
  } else {
    deadline = record.transferredAt + limitHours * HOUR_MS
    basis = 'post-transfer+48h (inferred)'
  }

  const hoursRemaining = (deadline - Date.now()) / HOUR_MS
  return { deadline, basis, hoursRemaining, isOverdue: hoursRemaining < 0 }
}

/** The basis of a deadline in words, for people. */
export function custodyBasisLabel(basis: CustodyCompliance['basis']) {
  return {
    'arrest+48h': () => m["custody.basis.arrest"](custodyLimits()),
    'transfer-window+7d': () => m["custody.basis.transfer_window"](custodyLimits()),
    'post-transfer+48h (inferred)': () => m["custody.basis.post_transfer"](custodyLimits()),
  }[basis]()
}
