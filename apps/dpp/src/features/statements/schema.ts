import * as z from 'zod'

// Confirmed statement categories (docs/dpp/RESEARCH.md §3, ODPP's own
// Decision to Charge Guidelines): witness statements (incl. exculpatory),
// arresting/investigating-officer statements, statements of the accused.
export const statementRoles = [
  { value: 'witness', label: 'Witness' },
  { value: 'accused', label: 'Statement of the accused' },
  { value: 'arresting_officer', label: 'Arresting officer' },
  { value: 'investigating_officer', label: 'Investigating officer' },
  { value: 'complainant', label: 'Complainant' },
] as const

export function statementRoleLabel(role: string) {
  return statementRoles.find((r) => r.value === role)?.label ?? role
}

export const statementSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  personId: z.string(),
  statementRole: z.string(),
  content: z.string().nullable(),
  givenAt: z.number(),
  sourceNote: z.string().nullable(),
  createdAt: z.number(),
  personFirstName: z.string(),
  personLastName: z.string(),
  personOtherNames: z.string().nullable(),
})

export type Statement = z.infer<typeof statementSchema>

export const createStatementSchema = z.object({
  prosecutionFileId: z.string().min(1),
  personId: z.string().min(1, 'Person is required.'),
  statementRole: z.string().min(1, 'Statement role is required.'),
  content: z.string(),
  givenAt: z.number(),
  sourceNote: z.string(),
})

export type CreateStatementInput = z.infer<typeof createStatementSchema>
