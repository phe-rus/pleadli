import * as z from 'zod'
import * as m from '@/paraglide/messages'

// Confirmed statement categories (docs/dpp/RESEARCH.md §3, ODPP's own
// Decision to Charge Guidelines): witness statements (incl. exculpatory),
// arresting/investigating-officer statements, statements of the accused.
export const statementRoles = [
  { value: 'witness', get label() { return m["statement.role.witness"]() } },
  { value: 'accused', get label() { return m["statement.role.accused"]() } },
  { value: 'arresting_officer', get label() { return m["statement.role.arresting_officer"]() } },
  { value: 'investigating_officer', get label() { return m["statement.role.investigating_officer"]() } },
  { value: 'complainant', get label() { return m["statement.role.complainant"]() } },
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
  personId: z.string().min(1, { error: () => m["statement.form.person_required"]() }),
  statementRole: z.string().min(1, { error: () => m["statement.form.role_required"]() }),
  content: z.string(),
  givenAt: z.number(),
  sourceNote: z.string(),
})

export type CreateStatementInput = z.infer<typeof createStatementSchema>
