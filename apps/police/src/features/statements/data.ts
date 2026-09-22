import { api } from '@/lib/api'
import * as z from 'zod'
import { createStatementSchema, statementSchema, type CreateStatementInput } from './schema'

function toRustInput(input: CreateStatementInput) {
  return {
    ...input,
    officerName: input.officerName || null,
  }
}

export async function createStatement(input: CreateStatementInput) {
  const parsed = toRustInput(createStatementSchema.parse(input))
  const statement = await api('/statements', { method: 'POST', body: JSON.stringify(parsed) })
  return statementSchema.parse(statement)
}

export async function updateStatement(id: string, input: CreateStatementInput) {
  const parsed = toRustInput(createStatementSchema.parse(input))
  const statement = await api(`/statements/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return statementSchema.parse(statement)
}

export async function listStatements(query: string) {
  const statements = await api(`/statements?query=${encodeURIComponent(query)}`)
  return z.array(statementSchema).parse(statements)
}
