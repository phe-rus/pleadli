import { isRichTextEmpty } from '@pleadli/rich-text'
import * as z from 'zod'

export const statementSchema = z.object({
  id: z.string(),
  content: z.string(),
  personId: z.string(),
  personFirstName: z.string(),
  personLastName: z.string(),
  personOtherNames: z.string().nullable(),
  caseId: z.string().nullable(),
  caseReference: z.string().nullable(),
  officerName: z.string().nullable(),
  givenAt: z.number(),
  createdAt: z.number(),
})

export type Statement = z.infer<typeof statementSchema>

export const createStatementSchema = z.object({
  content: z.string().refine((value) => !isRichTextEmpty(value), 'Statement content is required.'),
  personId: z.string().min(1, 'Person is required.'),
  caseId: z.string().nullable(),
  officerName: z.string(),
  givenAt: z.number(),
})

export type CreateStatementInput = z.infer<typeof createStatementSchema>

export function statementPersonName(statement: Statement) {
  return [statement.personLastName, statement.personFirstName, statement.personOtherNames]
    .filter(Boolean)
    .join(', ')
}
