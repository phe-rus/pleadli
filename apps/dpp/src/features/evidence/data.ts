import * as z from 'zod'
import { api, orNull, seg } from '@/lib/api'
import { createEvidenceItemSchema, evidenceItemSchema, type CreateEvidenceItemInput } from './schema'

export async function createEvidenceItem(input: CreateEvidenceItemInput) {
  const parsed = createEvidenceItemSchema.parse(input)
  const body = {
    ...parsed,
    description: orNull(parsed.description),
    identificationMark: orNull(parsed.identificationMark),
    recoveredFromLocation: orNull(parsed.recoveredFromLocation),
    sourceNote: orNull(parsed.sourceNote),
  }
  return evidenceItemSchema.parse(await api('POST', '/api/evidence-items', { body }))
}

export async function listEvidenceForFile(prosecutionFileId: string) {
  return z.array(evidenceItemSchema).parse(await api('GET', `/api/prosecution-files/${seg(prosecutionFileId)}/evidence-items`))
}
