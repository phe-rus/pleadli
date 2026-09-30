import * as m from '@/paraglide/messages'
import { isRichTextEmpty } from '@pleadli/rich-text'
import * as z from 'zod'

export const incidentSchema = z.object({
  id: z.string(),
  summary: z.string(),
  description: z.string(),
  location: z.string().nullable(),
  occurredAt: z.number(),
  personId: z.string().nullable(),
  personFirstName: z.string().nullable(),
  personLastName: z.string().nullable(),
  personOtherNames: z.string().nullable(),
  stationDiaryEntryId: z.string().nullable(),
  createdAt: z.number(),
})

export type Incident = z.infer<typeof incidentSchema>

export const createIncidentSchema = z.object({
  summary: z.string().min(1, { error: () => m["validation.summary_is_required"]() }),
  description: z.string().refine((value) => !isRichTextEmpty(value), { error: () => m["validation.description_is_required"]() }),
  location: z.string(),
  occurredAt: z.number(),
  personId: z.string().nullable(),
  stationDiaryEntryId: z.string().nullable(),
})

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>

export function incidentPersonName(incident: Incident) {
  if (!incident.personId) return null
  return [incident.personLastName, incident.personFirstName, incident.personOtherNames]
    .filter(Boolean)
    .join(', ')
}
