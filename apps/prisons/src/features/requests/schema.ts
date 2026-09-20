import * as z from 'zod'
import { m } from '@/paraglide/messages'

// Real, named complaint categories confirmed via the Human Rights Committee
// / "Mukutano" mechanism (docs/prisons/RESEARCH.md §11.6, UHRC 2023 +
// UK FCDO consular guidance, two independent sources).
export const requestCategories = [
  { value: 'food', get label() { return m.requests_food_quality_quantity() } },
  { value: 'remand_overstay', get label() { return m.requests_remand_overstay() } },
  { value: 'general_welfare', get label() { return m.requests_general_welfare() } },
  { value: 'other', get label() { return m.requests_other() } },
] as const

export function requestCategoryLabel(value: string) {
  return requestCategories.find((c) => c.value === value)?.label ?? value
}

export const requestSchema = z.object({
  id: z.string(),
  prisonerId: z.string().nullable(),
  category: z.string(),
  description: z.string(),
  raisedAt: z.number(),
  outcomeNote: z.string().nullable(),
  resolvedAt: z.number().nullable(),
  createdAt: z.number(),
  prisonerFirstName: z.string().nullable(),
  prisonerLastName: z.string().nullable(),
})

export type PrisonRequest = z.infer<typeof requestSchema>

export const createRequestSchema = z.object({
  prisonerId: z.string().nullable(),
  category: z.string().min(1, 'Category is required.'),
  description: z.string().min(1, 'A description is required.'),
  raisedAt: z.number(),
})

export type CreateRequestInput = z.infer<typeof createRequestSchema>

export const resolveRequestSchema = z.object({
  resolvedAt: z.number(),
  outcomeNote: z.string(),
})

export type ResolveRequestInput = z.infer<typeof resolveRequestSchema>
