import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createStatementSchema, statementSchema, type CreateStatementInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

function toRustInput(input: CreateStatementInput) {
  return {
    ...input,
    officerName: input.officerName || null,
  }
}

export async function createStatement(input: CreateStatementInput) {
  const parsed = toRustInput(createStatementSchema.parse(input))
  const statement = isTauri()
    ? await invoke('create_statement', { input: parsed })
    : await devFetch('/statements', { method: 'POST', body: JSON.stringify(parsed) })
  return statementSchema.parse(statement)
}

export async function updateStatement(id: string, input: CreateStatementInput) {
  const parsed = toRustInput(createStatementSchema.parse(input))
  const statement = isTauri()
    ? await invoke('update_statement', { id, input: parsed })
    : await devFetch(`/statements/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return statementSchema.parse(statement)
}

export async function listStatements(query: string) {
  const statements = isTauri()
    ? await invoke('list_statements', { query })
    : await devFetch(`/statements?query=${encodeURIComponent(query)}`)
  return z.array(statementSchema).parse(statements)
}
