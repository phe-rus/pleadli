import * as z from 'zod'
import { m } from '@/paraglide/messages'

// Real, named categories confirmed on the Uganda Prisons Service's own site
// (docs/prisons/RESEARCH.md §10), at real scale (21,996 participants in
// FY2021/22 alone). Not an invented generic "activities" list.
export const programmeCategories = [
  { value: 'vocational_training', get label() { return m.programme_participations_vocational_training_tailoring_welding_ag() } },
  { value: 'prison_industries', get label() { return m.programme_participations_prison_industries_furniture_production() } },
  { value: 'prison_farming', get label() { return m.programme_participations_prison_farming_livestock_cotton_maize_oi() } },
] as const

export function programmeCategoryLabel(value: string) {
  return programmeCategories.find((c) => c.value === value)?.label ?? value
}

// No attendance-tracking system for programmes was found (unlike Visits) —
// only participation status is modeled.
export const programmeStatuses = [
  { value: 'active', get label() { return m.programme_participations_active() } },
  { value: 'completed', get label() { return m.programme_participations_completed() } },
  { value: 'discontinued', get label() { return m.programme_participations_discontinued() } },
] as const

export function programmeStatusLabel(value: string) {
  return programmeStatuses.find((s) => s.value === value)?.label ?? value
}

export const programmeParticipationSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  category: z.string(),
  programmeName: z.string(),
  status: z.string(),
  startedAt: z.number(),
  notes: z.string().nullable(),
  completedAt: z.number().nullable(),
  certificateReference: z.string().nullable(),
  createdAt: z.number(),
})

export type ProgrammeParticipation = z.infer<typeof programmeParticipationSchema>

export const createProgrammeParticipationSchema = z.object({
  prisonerId: z.string().min(1),
  category: z.string().min(1, 'Category is required.'),
  programmeName: z.string().min(1, 'Programme name is required.'),
  status: z.string().min(1, 'Status is required.'),
  startedAt: z.number(),
  notes: z.string(),
})

export type CreateProgrammeParticipationInput = z.infer<typeof createProgrammeParticipationSchema>

// Real, discrete, dated external assessment/certification event (UVTAB
// trade-testing, docs/prisons/RESEARCH.md §11.9-11.10) — distinct from
// daily attendance, which stays unmodeled since no source describes it.
export const certifyProgrammeParticipationSchema = z.object({
  completedAt: z.number(),
  certificateReference: z.string(),
})

export type CertifyProgrammeParticipationInput = z.infer<typeof certifyProgrammeParticipationSchema>
