import * as z from 'zod'

export const producers = [
  { id: 'prosecution', label: 'Prosecution' },
  { id: 'defence', label: 'Defence' },
  { id: 'court', label: 'The court' },
] as const
export const producerLabel = (id: string) => producers.find((p) => p.id === id)?.label ?? id

export const exhibitStatuses = [
  { id: 'marked', label: 'Marked' },
  { id: 'admitted', label: 'Admitted' },
  { id: 'rejected', label: 'Rejected' },
] as const
export const exhibitStatusLabel = (id: string) => exhibitStatuses.find((s) => s.id === id)?.label ?? id

export const exhibitSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  sittingId: z.string().nullable(),
  label: z.string(),
  producedBy: z.string(),
  description: z.string(),
  witness: z.string().nullable(),
  status: z.string(),
  note: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Exhibit = z.infer<typeof exhibitSchema>

export type MarkExhibitInput = { sittingId: string | null; producedBy: string; description: string; witness: string | null }
export type UpdateExhibitInput = { description: string; witness: string | null; status: string; note: string | null }
