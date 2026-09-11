import * as z from 'zod'

export const activityItemSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  title: z.string(),
  subtitle: z.string(),
  occurredAt: z.number(),
  route: z.string(),
})

export type ActivityItem = z.infer<typeof activityItemSchema>

/** Higher-signal types get an expanded toast (title + description); the
 * rest get a compact pill (title only) — see features/activity/activity-toasts.tsx. */
const highSignalTypes = new Set(['incident', 'case', 'charge_sheet', 'custody_record'])

export function isHighSignalActivity(item: ActivityItem) {
  return highSignalTypes.has(item.entityType)
}

const severityByType: Record<string, 'high' | 'medium' | 'low'> = {
  incident: 'medium',
  case: 'medium',
  charge_sheet: 'medium',
  custody_record: 'medium',
  bond: 'medium',
  statement: 'low',
  station_diary_entry: 'low',
  referral: 'low',
  vehicle: 'low',
}

export function activitySeverity(item: ActivityItem) {
  return severityByType[item.entityType] ?? 'low'
}
