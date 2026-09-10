import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { caseSchema, casePersonSchema, caseWorkspaceSchema, createCaseSchema, type CreateCaseInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createCase(input: CreateCaseInput) {
  const parsed = createCaseSchema.parse(input)
  const created = isTauri()
    ? await invoke('create_case', { input: parsed })
    : await devFetch('/cases', { method: 'POST', body: JSON.stringify(parsed) })
  return caseSchema.parse(created)
}

export async function updateCase(id: string, input: CreateCaseInput) {
  const parsed = createCaseSchema.parse(input)
  const updated = isTauri()
    ? await invoke('update_case', { id, input: parsed })
    : await devFetch(`/cases/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return caseSchema.parse(updated)
}

export async function listCases(query: string) {
  const cases = isTauri()
    ? await invoke('list_cases', { query })
    : await devFetch(`/cases?query=${encodeURIComponent(query)}`)
  return z.array(caseSchema).parse(cases)
}

export async function listCasePeople(caseId: string) {
  const people = isTauri()
    ? await invoke('list_case_people', { caseId })
    : await devFetch(`/cases/${encodeURIComponent(caseId)}/people`)
  return z.array(casePersonSchema).parse(people)
}

export async function getCaseWorkspace(id: string) {
  const workspace = isTauri()
    ? await invoke('get_case_workspace', { id })
    : await devFetch(`/cases/${encodeURIComponent(id)}/workspace`)
  return caseWorkspaceSchema.nullable().parse(workspace)
}
