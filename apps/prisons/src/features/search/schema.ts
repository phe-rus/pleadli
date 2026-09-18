import * as z from 'zod'

export const entityTypeLabels: Record<string, string> = {
  prisoner: 'Prisoner',
  court_production: 'Court Production',
  health_event: 'Health Event',
  programme_participation: 'Programme',
  property_record: 'Property',
  release: 'Release',
  request: 'Request',
  transfer: 'Transfer',
  visit: 'Visit',
}

export function entityTypeLabel(entityType: string) {
  return entityTypeLabels[entityType] ?? entityType
}

export const searchResultSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  title: z.string(),
  subtitle: z.string(),
  matchedOn: z.object({
    field: z.string(),
    value: z.string().nullable(),
  }),
  route: z.string(),
})

export type SearchResult = z.infer<typeof searchResultSchema>
