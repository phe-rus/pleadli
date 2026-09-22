import * as z from 'zod'

// The confirmed decision-type set from docs/dpp/PRODUCT.md §Decisions &
// Reviews (RESEARCH.md §4). `delegable: false` marks discontinuance and
// nolle prosequi, which are the Director of Public Prosecutions' alone
// (Constitution Art. 120(3)(d)/(4); Trial on Indictments Act §135). The
// server refuses them unless the installation's prosecutor is marked as the
// DPP (`domain/decisions.rs`); the UI only explains that ahead of time.
export const decisionTypes = [
  { value: 'sanction', label: 'Sanction (decide to prosecute)', delegable: true },
  { value: 'threshold_charge', label: 'Threshold Test charge', delegable: true },
  { value: 'decline', label: 'Decline to charge', delegable: true },
  { value: 'divert', label: 'Divert (alternative to prosecution)', delegable: true },
  { value: 'return_for_investigation', label: 'Return for further investigation', delegable: true },
  { value: 'take_over', label: 'Take over prosecution', delegable: true },
  { value: 'discontinue', label: 'Discontinue proceedings', delegable: false },
  { value: 'nolle_prosequi', label: 'Nolle prosequi', delegable: false },
  { value: 'plea_bargain_accepted', label: 'Plea bargain accepted', delegable: true },
  { value: 'committal_venue_high_court', label: 'Committal / venue decision (High Court)', delegable: true },
  { value: 'amend_charge', label: 'Amend / direct alternative charge', delegable: true },
] as const

export function decisionTypeLabel(type: string) {
  return decisionTypes.find((d) => d.value === type)?.label ?? type
}

export function decisionTypeDelegable(type: string) {
  return decisionTypes.find((d) => d.value === type)?.delegable ?? true
}

export const decisionSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  decisionType: z.string(),
  decidedBy: z.string().nullable(),
  decidedAt: z.number(),
  reasons: z.string().nullable(),
  createdAt: z.number(),
  /** The count decided, or null for the whole file. */
  chargeId: z.string().nullable(),
  reviewId: z.string().nullable(),
  /** The earlier decision this one corrects. */
  correctsDecisionId: z.string().nullable(),
})

export type Decision = z.infer<typeof decisionSchema>

/** A decision in the log across all files. */
export const decisionRowSchema = decisionSchema.extend({
  fileTitle: z.string(),
  fileReference: z.string().nullable(),
})

export type DecisionRow = z.infer<typeof decisionRowSchema>

export const createDecisionSchema = z.object({
  prosecutionFileId: z.string().min(1),
  decisionType: z.string().min(1, 'Decision type is required.'),
  decidedBy: z.string(),
  decidedAt: z.number(),
  reasons: z.string(),
  /** Empty means the whole file. */
  chargeIds: z.array(z.string()),
  reviewId: z.string().nullable(),
  correctsDecisionId: z.string().nullable(),
  concludeReview: z.boolean(),
  directions: z.array(z.object({ kind: z.string(), instruction: z.string().min(1, 'Every direction needs its instruction written out.'), personId: z.string().nullable() })),
})

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>

/** Decisions recorded together (one row per count, same review and type)
 * are one act. The list of decisions shows every row; a document is made
 * once per act. */
export function decisionActs<T extends Decision>(decisions: readonly T[]): { key: string; decisions: T[] }[] {
  const acts = new Map<string, T[]>()
  for (const decision of decisions) {
    const key = decision.reviewId ? `${decision.reviewId}:${decision.decisionType}` : decision.id
    acts.set(key, [...(acts.get(key) ?? []), decision])
  }
  return [...acts.entries()].map(([key, rows]) => ({ key, decisions: rows }))
}
