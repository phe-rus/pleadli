import * as z from 'zod'

// The five statuses below are exactly the decision points
// docs/police/research/custody-and-bonds.md verified against the Police
// Act (release without charge, release on bond, production in court,
// referral to DPP, or continued custody bounded by the deadline) — not
// invented.
export const custodyStatuses = [
  { value: 'in_custody', label: 'In custody' },
  { value: 'released_no_charge', label: 'Released without charge' },
  { value: 'released_on_bond', label: 'Released on bond' },
  { value: 'produced_in_court', label: 'Produced in court' },
  { value: 'referred_to_dpp', label: 'Referred to DPP' },
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
  createdAt: z.number(),
})

export type CustodyRecord = z.infer<typeof custodyRecordSchema>

export const createCustodyRecordSchema = z.object({
  personId: z.string().min(1, 'Person is required.'),
  incidentId: z.string().nullable(),
  caseId: z.string().nullable(),
  arrestedAt: z.number(),
  location: z.string(),
  crossJurisdictionTransfer: z.boolean(),
  transferredAt: z.number().nullable(),
  status: z.string().min(1, 'Status is required.'),
  releasedAt: z.number().nullable(),
  notes: z.string(),
})

export type CreateCustodyRecordInput = z.infer<typeof createCustodyRecordSchema>

export function custodyPersonName(record: CustodyRecord) {
  return [record.personLastName, record.personFirstName, record.personOtherNames].filter(Boolean).join(', ')
}

const HOUR_MS = 60 * 60 * 1000

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

  if (!record.crossJurisdictionTransfer) {
    deadline = record.arrestedAt + 48 * HOUR_MS
    basis = 'arrest+48h'
  } else if (!record.transferredAt) {
    deadline = record.arrestedAt + 7 * 24 * HOUR_MS
    basis = 'transfer-window+7d'
  } else {
    deadline = record.transferredAt + 48 * HOUR_MS
    basis = 'post-transfer+48h (inferred)'
  }

  const hoursRemaining = (deadline - Date.now()) / HOUR_MS
  return { deadline, basis, hoursRemaining, isOverdue: hoursRemaining < 0 }
}
