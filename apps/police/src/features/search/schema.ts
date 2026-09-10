import * as z from 'zod'

export const entityTypeLabels: Record<string, string> = {
  person: 'Person',
  case: 'Case',
  incident: 'Incident',
  statement: 'Statement',
  custody_record: 'Custody',
  bond: 'Bond',
  station_diary_entry: 'Station Diary',
  duty_assignment: 'Duty Roster',
  station_asset: 'Station Asset',
  exhibit: 'Evidence',
  charge_sheet: 'Charge Sheet',
  referral: 'Referral',
  attachment: 'File',
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
