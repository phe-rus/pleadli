import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const entityTypeLabels: Record<string, string> = {
  get prisoner() { return m.search_prisoner() },
  get court_production() { return m.search_court_production() },
  get health_event() { return m.search_health_event() },
  get programme_participation() { return m.search_programme() },
  get property_record() { return m.search_property() },
  get release() { return m.search_release() },
  get request() { return m.search_request() },
  get transfer() { return m.search_transfer() },
  get visit() { return m.search_visit() },
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
