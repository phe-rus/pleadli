import * as m from '@/paraglide/messages'
import * as z from 'zod'

/** Message functions, not strings, so each label is read in the current
 * language when it is shown. */
const entityTypeLabels: Record<string, () => string> = {
  person: m["search.entity.person"],
  case: m["search.entity.case"],
  incident: m["search.entity.incident"],
  statement: m["search.entity.statement"],
  custody_record: m["search.entity.custody_record"],
  bond: m["search.entity.bond"],
  station_diary_entry: m["search.entity.station_diary_entry"],
  duty_assignment: m["search.entity.duty_assignment"],
  station_asset: m["search.entity.station_asset"],
  exhibit: m["search.entity.exhibit"],
  charge_sheet: m["search.entity.charge_sheet"],
  referral: m["search.entity.referral"],
  attachment: m["search.entity.attachment"],
}

export function entityTypeLabel(entityType: string) {
  return entityTypeLabels[entityType]?.() ?? entityType
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
