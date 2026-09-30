import * as m from '@/paraglide/messages'
import * as z from 'zod'

// Unified Referrals & Dispatches — docs/police/PRODUCT.md, resolved 2026-09
// after checking whether "dispatch" named a genuinely distinct workflow.
// It doesn't: real usage splits into an operational/live-response sense
// (out of scope — no radio/location integration) and a colloquial media
// synonym for the same referral event this domain already models.
export const referralDestinationTypes = [
  { value: 'dpp', get label() { return m["referrals.destination.dpp_resident_state_attorney"]() } },
  { value: 'court', get label() { return m["referrals.destination.courts"]() } },
  { value: 'other_station', get label() { return m["referrals.destination.another_station_unit"]() } },
  { value: 'other', get label() { return m["referrals.destination.other"]() } },
] as const

export function referralDestinationTypeLabel(type: string) {
  return referralDestinationTypes.find((t) => t.value === type)?.label ?? type
}

// The three real outcomes docs/police/research verified for the DPP path
// (sanctioned / no offence disclosed / still pending) — not an invented
// procedure, and reused as-is for every destination type rather than
// inventing a separate status set per destination.
export const referralStatuses = [
  { value: 'pending', get label() { return m["referrals.status.pending"]() } },
  { value: 'accepted', get label() { return m["referrals.status.accepted"]() } },
  { value: 'rejected', get label() { return m["referrals.status.rejected"]() } },
] as const

export function referralStatusLabel(status: string) {
  return referralStatuses.find((s) => s.value === status)?.label ?? status
}

export const referralSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  caseReference: z.string(),
  destinationType: z.string(),
  destinationName: z.string().nullable(),
  referredAt: z.number(),
  status: z.string(),
  officerId: z.string().nullable(),
  officerName: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type Referral = z.infer<typeof referralSchema>

export const createReferralSchema = z.object({
  caseId: z.string().min(1, { error: () => m["validation.case_is_required"]() }),
  destinationType: z.string().min(1, { error: () => m["validation.destination_type_is_required"]() }),
  destinationName: z.string(),
  referredAt: z.number(),
  status: z.string().min(1, { error: () => m["validation.status_is_required"]() }),
  officerId: z.string().nullable(),
  officerName: z.string(),
  notes: z.string(),
})

export type CreateReferralInput = z.infer<typeof createReferralSchema>
