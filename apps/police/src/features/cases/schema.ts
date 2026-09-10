// Imported from each domain's own schema module directly, not its feature
// barrel — the same circular-import precaution as features/people/schema.ts.
import { attachmentSchema } from '@/features/attachments/schema'
import { bondSchema } from '@/features/bonds/schema'
import { custodyRecordSchema } from '@/features/custody/schema'
import { exhibitSchema } from '@/features/evidence/schema'
import { chargeSheetSchema } from '@/features/legal-forms/schema'
import { referralSchema } from '@/features/referrals/schema'
import { statementSchema } from '@/features/statements/schema'
import * as z from 'zod'

// The role list is exactly what docs/police/PRODUCT.md specifies for how a
// Case relates to People — not invented here.
export const caseRoles = [
  { value: 'complainant', label: 'Complainant' },
  { value: 'suspect', label: 'Suspect' },
  { value: 'witness', label: 'Witness' },
  { value: 'victim', label: 'Victim' },
  { value: 'accused', label: 'Accused' },
] as const

export function caseRoleLabel(role: string) {
  return caseRoles.find((r) => r.value === role)?.label ?? role
}

// Deliberately minimal — PRODUCT.md says not to invent workflow states.
// A real "referred" status belongs with the Referrals domain once that's
// resolved, not guessed at here.
export const caseStatuses = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
] as const

export function caseStatusLabel(status: string) {
  return caseStatuses.find((s) => s.value === status)?.label ?? status
}

export const caseSchema = z.object({
  id: z.string(),
  reference: z.string(),
  summary: z.string(),
  status: z.string(),
  incidentId: z.string().nullable(),
  incidentSummary: z.string().nullable(),
  peopleCount: z.number(),
  createdAt: z.number(),
})

export type Case = z.infer<typeof caseSchema>

export const casePersonSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  personId: z.string(),
  role: z.string(),
  personFirstName: z.string(),
  personLastName: z.string(),
  personOtherNames: z.string().nullable(),
})

export type CasePerson = z.infer<typeof casePersonSchema>

export const casePersonInputSchema = z.object({
  personId: z.string(),
  role: z.string(),
})

export const createCaseSchema = z.object({
  reference: z.string().min(1, 'Reference is required.'),
  summary: z.string().min(1, 'Summary is required.'),
  status: z.string().min(1, 'Status is required.'),
  incidentId: z.string().nullable(),
  people: z.array(casePersonInputSchema),
})

export type CreateCaseInput = z.infer<typeof createCaseSchema>

export function casePersonName(person: Pick<CasePerson, 'personFirstName' | 'personLastName' | 'personOtherNames'>) {
  return [person.personLastName, person.personFirstName, person.personOtherNames].filter(Boolean).join(', ')
}

// The Investigation workspace: resolved to be a composed read over a
// Case's own already-linked records, not a separate entity — see
// docs/police/PRODUCT.md's Investigations section.
export const caseWorkspaceSchema = z.object({
  case: caseSchema,
  people: z.array(casePersonSchema),
  statements: z.array(statementSchema),
  custodyRecords: z.array(custodyRecordSchema),
  bonds: z.array(bondSchema),
  exhibits: z.array(exhibitSchema),
  chargeSheets: z.array(chargeSheetSchema),
  referrals: z.array(referralSchema),
  attachments: z.array(attachmentSchema),
})

export type CaseWorkspace = z.infer<typeof caseWorkspaceSchema>
