import * as z from 'zod'
import * as m from '@/paraglide/messages'

// Confirmed evidence categories (docs/dpp/RESEARCH.md §3, ODPP's own
// Guidelines): expert evidence, digital evidence, documentary evidence,
// exhibits.
export const evidenceCategories = [
  { value: 'exhibit', get label() { return m["evidence.category.exhibit"]() } },
  { value: 'digital', get label() { return m["evidence.category.digital"]() } },
  { value: 'documentary', get label() { return m["evidence.category.documentary"]() } },
  { value: 'expert', get label() { return m["evidence.category.expert"]() } },
] as const

export function evidenceCategoryLabel(category: string) {
  return evidenceCategories.find((c) => c.value === category)?.label ?? category
}

export const evidenceItemSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  identificationMark: z.string().nullable(),
  recoveredFromLocation: z.string().nullable(),
  sourceNote: z.string().nullable(),
  createdAt: z.number(),
})

export type EvidenceItem = z.infer<typeof evidenceItemSchema>

export const createEvidenceItemSchema = z.object({
  prosecutionFileId: z.string().min(1),
  category: z.string().min(1, { error: () => m["evidence.form.category_required"]() }),
  description: z.string(),
  identificationMark: z.string(),
  recoveredFromLocation: z.string(),
  sourceNote: z.string(),
})

export type CreateEvidenceItemInput = z.infer<typeof createEvidenceItemSchema>
