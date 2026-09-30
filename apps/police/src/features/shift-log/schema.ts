import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const checkInMethods = [
  { value: 'badge_entry', get label() { return m["shift_log.method.badge_entry"]() } },
  { value: 'remote_scan', get label() { return m["shift_log.method.remote_scan"]() } },
] as const

export function checkInMethodLabel(method: string) {
  return checkInMethods.find((x) => x.value === method)?.label ?? method
}

export const officerCheckInSchema = z.object({
  id: z.string(),
  officerId: z.string(),
  officerName: z.string(),
  method: z.string(),
  checkedInAt: z.number(),
  createdAt: z.number(),
})

export type OfficerCheckIn = z.infer<typeof officerCheckInSchema>

export const shiftHandoverSchema = z.object({
  id: z.string(),
  outgoingOfficerId: z.string().nullable(),
  outgoingOfficerName: z.string().nullable(),
  incomingOfficerId: z.string(),
  incomingOfficerName: z.string(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
  handedOverAt: z.number(),
  createdAt: z.number(),
})

export type ShiftHandover = z.infer<typeof shiftHandoverSchema>

export const createShiftHandoverSchema = z.object({
  outgoingOfficerId: z.string().nullable(),
  incomingOfficerId: z.string().min(1, { error: () => m["validation.incoming_officer_is_required"]() }),
  unit: z.string(),
  notes: z.string(),
  handedOverAt: z.number(),
})

export type CreateShiftHandoverInput = z.infer<typeof createShiftHandoverSchema>
