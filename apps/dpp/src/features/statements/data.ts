import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createStatementSchema, statementSchema, type CreateStatementInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createStatement(input: CreateStatementInput) {
  const parsed = createStatementSchema.parse(input)
  const rustInput = { ...parsed, content: parsed.content || null, sourceNote: parsed.sourceNote || null }
  const statement = isTauri()
    ? await invoke('create_statement', { input: rustInput })
    : await devFetch('/statements', { method: 'POST', body: JSON.stringify(rustInput) })
  return statementSchema.parse(statement)
}

export async function listStatementsForFile(prosecutionFileId: string) {
  const statements = isTauri()
    ? await invoke('list_statements_for_file', { prosecutionFileId })
    : await devFetch(`/prosecution-files/${encodeURIComponent(prosecutionFileId)}/statements`)
  return z.array(statementSchema).parse(statements)
}
