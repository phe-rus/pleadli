import * as z from 'zod'
import { api, orNull, seg } from '@/lib/api'
import { createStatementSchema, statementSchema, type CreateStatementInput } from './schema'

export async function createStatement(input: CreateStatementInput) {
  const parsed = createStatementSchema.parse(input)
  const body = { ...parsed, content: orNull(parsed.content), sourceNote: orNull(parsed.sourceNote) }
  return statementSchema.parse(await api('POST', '/api/statements', { body }))
}

export async function listStatementsForFile(prosecutionFileId: string) {
  return z.array(statementSchema).parse(await api('GET', `/api/prosecution-files/${seg(prosecutionFileId)}/statements`))
}
