import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createDecisionSchema, decisionSchema, type CreateDecisionInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createDecision(input: CreateDecisionInput) {
  const parsed = createDecisionSchema.parse(input)
  const rustInput = { ...parsed, decidedBy: parsed.decidedBy || null, reasons: parsed.reasons || null }
  const decision = isTauri()
    ? await invoke('create_decision', { input: rustInput })
    : await devFetch('/decisions', { method: 'POST', body: JSON.stringify(rustInput) })
  return decisionSchema.parse(decision)
}

export async function listDecisionsForFile(prosecutionFileId: string) {
  const decisions = isTauri()
    ? await invoke('list_decisions_for_file', { prosecutionFileId })
    : await devFetch(`/prosecution-files/${encodeURIComponent(prosecutionFileId)}/decisions`)
  return z.array(decisionSchema).parse(decisions)
}
