import { api, seg } from '@/lib/api'
import { exhibitSchema, type MarkExhibitInput, type UpdateExhibitInput } from './schema'

export async function markExhibit(caseId: string, input: MarkExhibitInput) {
  return exhibitSchema.parse(await api('POST', `/api/cases/${seg(caseId)}/exhibits`, { body: input }))
}

export async function updateExhibit(id: string, input: UpdateExhibitInput) {
  return exhibitSchema.parse(await api('PUT', `/api/exhibits/${seg(id)}`, { body: input }))
}

export async function removeExhibit(id: string) {
  await api('DELETE', `/api/exhibits/${seg(id)}`)
}
