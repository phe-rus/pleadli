import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const medicalKinds = [
  { value: 'pf3', get label() { return m["medical.kind.pf3"]() } },
  { value: 'post_mortem', get label() { return m["medical.kind.post_mortem"]() } },
] as const

export const medicalStatuses = [
  { value: 'requested', get label() { return m["medical.status.requested"]() } },
  { value: 'completed', get label() { return m["medical.status.completed"]() } },
] as const

export const medicalKindLabel = (kind: string) => medicalKinds.find((k) => k.value === kind)?.label ?? kind
export const medicalStatusLabel = (status: string) => medicalStatuses.find((s) => s.value === status)?.label ?? status

export const medicalExamSchema = z.object({
  id: z.string(),
  kind: z.string(),
  personId: z.string(),
  personFirstName: z.string(),
  personLastName: z.string(),
  personOtherNames: z.string().nullable(),
  caseId: z.string().nullable(),
  caseReference: z.string().nullable(),
  facility: z.string().nullable(),
  examinerName: z.string().nullable(),
  requestedAt: z.number(),
  examinedAt: z.number().nullable(),
  status: z.string(),
  findings: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type MedicalExam = z.infer<typeof medicalExamSchema>

export const createMedicalExamSchema = z.object({
  kind: z.string().min(1),
  personId: z.string().min(1, { error: () => m["medical.person_required"]() }),
  caseId: z.string().nullable(),
  facility: z.string(),
  examinerName: z.string(),
  requestedAt: z.number(),
  examinedAt: z.number().nullable(),
  status: z.string().min(1),
  findings: z.string(),
  notes: z.string(),
}).refine((v) => v.status !== 'completed' || v.examinedAt != null, { error: () => m["medical.date_required"](), path: ['examinedAt'] })

export type CreateMedicalExamInput = z.infer<typeof createMedicalExamSchema>
