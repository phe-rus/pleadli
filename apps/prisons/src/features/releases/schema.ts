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
  { value: 'erroneous_release_correction', label: 'Erroneous release — re-arrested (s.79)' },
] as const

export function releaseTypeLabel(type: string) {
  return releaseTypes.find((r) => r.value === type)?.label ?? type
}

export const releaseSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  releaseType: z.string(),
  releasedAt: z.number(),
  orderedBy: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type Release = z.infer<typeof releaseSchema>

export const createReleaseSchema = z.object({
  prisonerId: z.string().min(1),
  releaseType: z.string().min(1, 'Release type is required.'),
  releasedAt: z.number(),
  orderedBy: z.string(),
  notes: z.string(),
})

export type CreateReleaseInput = z.infer<typeof createReleaseSchema>
