import * as z from 'zod'

// The confirmed decision-type set from docs/dpp/PRODUCT.md §Decisions &
// Reviews (RESEARCH.md §4). `delegable: false` is informational only — no
// local auth/permission system exists yet to actually enforce that
// discontinuance and nolle prosequi are DPP-exclusive (Constitution Art.
// 120(3)(d)/(4); Trial on Indictments Act §135) — it's surfaced in the UI
// as a plain notice, never silently enforced as if a real permission check
// happened.
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
})

export type Decision = z.infer<typeof decisionSchema>

export const createDecisionSchema = z.object({
  prosecutionFileId: z.string().min(1),
  decisionType: z.string().min(1, 'Decision type is required.'),
  decidedBy: z.string(),
  decidedAt: z.number(),
  reasons: z.string(),
})

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>
