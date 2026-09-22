import * as z from 'zod'
import { api, orNull, seg } from '@/lib/api'
import { createDecisionSchema, decisionRowSchema, decisionSchema, type CreateDecisionInput } from './schema'

export async function createDecision(input: CreateDecisionInput) {
  const parsed = createDecisionSchema.parse(input)
  const body = { ...parsed, decidedBy: orNull(parsed.decidedBy), reasons: orNull(parsed.reasons) }
  // One row per count decided; the whole file is one row.
  return z.array(decisionSchema).parse(await api('POST', '/api/decisions', { body }))
}

export async function listDecisionsForFile(prosecutionFileId: string) {
  return z.array(decisionSchema).parse(await api('GET', `/api/prosecution-files/${seg(prosecutionFileId)}/decisions`))
}

/** Every decision on every file, newest first. */
export async function listDecisions() {
  return z.array(decisionRowSchema).parse(await api('GET', '/api/decisions'))
}
