import * as z from 'zod'
import * as m from '@/paraglide/messages'
import { activeJurisdiction, packText } from '@/lib/jurisdiction'

// The confirmed decision-type set from docs/dpp/PRODUCT.md §Decisions &
// Reviews (RESEARCH.md §4). `delegable: false` marks discontinuance and
// nolle prosequi, which are the Director of Public Prosecutions' alone
// (Constitution Art. 120(3)(d)/(4); Trial on Indictments Act §135). The
// server refuses them unless the installation's prosecutor is marked as the
// DPP (`domain/decisions.rs`); the UI only explains that ahead of time.
export const decisionTypes = [
  { value: 'sanction', get label() { return m["decision.type.sanction"]() }, delegable: true },
  { value: 'threshold_charge', get label() { return m["decision.type.threshold_charge"]() }, delegable: true },
  { value: 'decline', get label() { return m["decision.type.decline"]() }, delegable: true },
  { value: 'divert', get label() { return m["decision.type.divert"]() }, delegable: true },
  { value: 'return_for_investigation', get label() { return m["decision.type.return_for_investigation"]() }, delegable: true },
  { value: 'take_over', get label() { return m["decision.type.take_over"]() }, delegable: true },
  { value: 'discontinue', get label() { return m["decision.type.discontinue"]() }, delegable: false },
  { value: 'nolle_prosequi', get label() { return m["decision.type.nolle_prosequi"]() }, delegable: false },
  { value: 'plea_bargain_accepted', get label() { return m["decision.type.plea_bargain_accepted"]() }, delegable: true },
  { value: 'committal_venue_high_court', get label() { return m["decision.type.committal_venue_high_court"]() }, delegable: true },
  { value: 'amend_charge', get label() { return m["decision.type.amend_charge"]() }, delegable: true },
] as const

/** The decisions this office's country has, under its own names. A country
 * not yet researched gets the general set. A decision recorded under another
 * country (a dev switch, an imported file) still shows by the general name. */
export function availableDecisionTypes() {
  const pack = activeJurisdiction()?.decisions
  if (!pack) return [...decisionTypes]
  return decisionTypes
    .filter((d) => pack.some((o) => o.kind === d.value))
    .map((d) => ({ ...d, label: decisionTypeLabel(d.value) }))
}

export function decisionTypeLabel(type: string) {
  const own = activeJurisdiction()?.decisions?.find((o) => o.kind === type)
  if (own) return packText(own.label)
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
  decisionType: z.string().min(1, { error: () => m["decision.form.type_required"]() }),
  decidedBy: z.string(),
  decidedAt: z.number(),
  reasons: z.string(),
  /** Empty means the whole file. */
  chargeIds: z.array(z.string()),
  reviewId: z.string().nullable(),
  correctsDecisionId: z.string().nullable(),
  concludeReview: z.boolean(),
  directions: z.array(z.object({ kind: z.string(), instruction: z.string().min(1, { error: () => m["decision.form.direction_instruction_required"]() }), personId: z.string().nullable() })),
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
