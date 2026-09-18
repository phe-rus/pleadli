import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createEvidenceItemSchema, evidenceItemSchema, type CreateEvidenceItemInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createEvidenceItem(input: CreateEvidenceItemInput) {
  const parsed = createEvidenceItemSchema.parse(input)
  const rustInput = {
    ...parsed,
    description: parsed.description || null,
    identificationMark: parsed.identificationMark || null,
    recoveredFromLocation: parsed.recoveredFromLocation || null,
    sourceNote: parsed.sourceNote || null,
  }
  const item = isTauri()
    ? await invoke('create_evidence_item', { input: rustInput })
    : await devFetch('/evidence-items', { method: 'POST', body: JSON.stringify(rustInput) })
  return evidenceItemSchema.parse(item)
}

export async function listEvidenceForFile(prosecutionFileId: string) {
  const items = isTauri()
    ? await invoke('list_evidence_for_file', { prosecutionFileId })
    : await devFetch(`/prosecution-files/${encodeURIComponent(prosecutionFileId)}/evidence-items`)
  return z.array(evidenceItemSchema).parse(items)
}
