import * as z from 'zod'

// The six distinct statutory triggers confirmed in docs/prisons/RESEARCH.md
// §4, plus the one correction type (s.79) that reverses a release.
export const releaseTypes = [
  { value: 'bail', label: 'Bail' },
  { value: 'full_remission', label: 'Full remission' },
  { value: 'partial_remission', label: 'Partial remission' },
  { value: 'parole', label: 'Parole' },
  { value: 'release_on_licence', label: 'Release on licence' },
  { value: 'acquittal', label: 'Acquittal / court-ordered discharge' },
  { value: 'erroneous_release_correction', label: 'Erroneous release: re-arrested (s.79)' },
] as const

export function releaseTypeLabel(type: string) {
  return releaseTypes.find((r) => r.value === type)?.label ?? type
}

/** Release types that are a discharge on entitlement, where s.83 requires
 * discharge before noon. */
export function isEntitlementRelease(type: string) {
  return type === 'full_remission' || type === 'partial_remission'
}

export const releaseSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  releaseType: z.string(),
  releasedAt: z.number(),
  orderedBy: z.string().nullable(),
  notes: z.string().nullable(),
  basis: z.string().nullable(),
  authorisedBy: z.string().nullable(),
  exceptionReason: z.string().nullable(),
  exceptionGates: z.string().nullable(),
  afterNoon: z.boolean(),
  createdAt: z.number(),
})

export type Release = z.infer<typeof releaseSchema>

export const gateCheckSchema = z.object({
  key: z.string(),
  label: z.string(),
  blocking: z.boolean(),
  met: z.boolean(),
  detail: z.string().nullable(),
})

export type GateCheck = z.infer<typeof gateCheckSchema>

export const dischargeAssessmentSchema = z.object({
  inCustody: z.boolean(),
  gates: z.array(gateCheckSchema),
  releaseDueOn: z.number().nullable(),
  blocked: z.boolean(),
})

export type DischargeAssessment = z.infer<typeof dischargeAssessmentSchema>

export const createReleaseSchema = z.object({
  prisonerId: z.string().min(1),
  releaseType: z.string().min(1, 'Release type is required.'),
  releasedAt: z.number(),
  orderedBy: z.string(),
  basis: z.string(),
  notes: z.string(),
  exception: z
    .object({
      reason: z.string(),
      authoriser: z.object({ badgeNumber: z.string(), password: z.string() }).nullable(),
    })
    .nullable(),
})

export type CreateReleaseInput = z.infer<typeof createReleaseSchema>

/** Reads a stored `exceptionGates` JSON array back into gate keys. */
export function parseWaivedGates(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : []
  } catch {
    return []
  }
}
