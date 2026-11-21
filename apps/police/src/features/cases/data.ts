import { api, DEV_API_URL } from '@/lib/api'
import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { caseSchema, casePersonSchema, caseWorkspaceSchema, createCaseSchema, type CreateCaseInput } from './schema'

const DEV_SERVER_URL = DEV_API_URL

export async function createCase(input: CreateCaseInput) {
  const parsed = createCaseSchema.parse(input)
  const created = await api('/cases', { method: 'POST', body: JSON.stringify(parsed) })
  return caseSchema.parse(created)
}

export async function updateCase(id: string, input: CreateCaseInput) {
  const parsed = createCaseSchema.parse(input)
  const updated = await api(`/cases/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return caseSchema.parse(updated)
}

export async function listCases(query: string) {
  const cases = await api(`/cases?query=${encodeURIComponent(query)}`)
  return z.array(caseSchema).parse(cases)
}

export async function listCaseAccess(caseId: string) {
  return z.array(z.string()).parse(await api(`/cases/${encodeURIComponent(caseId)}/access`))
}

export async function listCasePeople(caseId: string) {
  const people = await api(`/cases/${encodeURIComponent(caseId)}/people`)
  return z.array(casePersonSchema).parse(people)
}

export async function getCaseWorkspace(id: string) {
  const workspace = await api(`/cases/${encodeURIComponent(id)}/workspace`)
  return caseWorkspaceSchema.nullable().parse(workspace)
}

export type DocumentFormat = 'pdf' | 'docx'

/** A formatted PDF/Word case file: people involved, statements, custody,
 * bonds, evidence, charge sheets, referrals, for filing or handing to
 * DPP. See `people.exportPersonDocument` for the Tauri/dev-fallback
 * split; returns `false` only if the officer cancels the save dialog. */
export async function exportCaseDocument(id: string, format: DocumentFormat) {
  if (isTauri()) {
    const { downloadPath, saidSaved } = await import('@/lib/downloads')
    const path = await downloadPath(`case-file.${format}`)
    await invoke('export_case_document', { id, format, destinationPath: path })
    saidSaved(path)
    return true
  }
  window.open(`${DEV_SERVER_URL}/cases/${encodeURIComponent(id)}/export/${format}`, '_blank')
  return true
}
