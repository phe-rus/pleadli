import * as z from 'zod'

// Confirmed event pairs (docs/prisons/RESEARCH.md §5): sick-prisoner
// hospital referral/return (ss.75-76) and mental-hospital transfer/return
// (s.74). Recording either never changes custody status — the Act's own
// text keeps a hospitalised prisoner "under detention" throughout.
export const healthEventTypes = [
  { value: 'hospital_referral', label: 'Hospital referral' },
  { value: 'hospital_return', label: 'Returned from hospital' },
  { value: 'mental_hospital_transfer', label: 'Mental hospital transfer (s.74)' },
  { value: 'mental_hospital_return', label: 'Returned from mental hospital' },
] as const

export function healthEventTypeLabel(type: string) {
  return healthEventTypes.find((t) => t.value === type)?.label ?? type
}

export const healthEventSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  eventType: z.string(),
  facilityName: z.string().nullable(),
  occurredAt: z.number(),
  authorizedBy: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type HealthEvent = z.infer<typeof healthEventSchema>

export const createHealthEventSchema = z.object({
  prisonerId: z.string().min(1),
  eventType: z.string().min(1, 'Event type is required.'),
  facilityName: z.string(),
  occurredAt: z.number(),
  authorizedBy: z.string(),
  notes: z.string(),
})

export type CreateHealthEventInput = z.infer<typeof createHealthEventSchema>

export const hospitalisedEntrySchema = z.object({
  prisonerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  eventType: z.string(),
  facilityName: z.string().nullable(),
  occurredAt: z.number(),
})

export type HospitalisedEntry = z.infer<typeof hospitalisedEntrySchema>
