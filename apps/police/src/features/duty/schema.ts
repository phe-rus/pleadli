import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const dutyAssignmentSchema = z.object({
  id: z.string(),
  officerId: z.string().nullable(),
  officerName: z.string(),
  officerRank: z.string().nullable(),
  unit: z.string().nullable(),
  shiftStart: z.number(),
  shiftEnd: z.number(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type DutyAssignment = z.infer<typeof dutyAssignmentSchema>

export const createDutyAssignmentSchema = z
  .object({
    officerId: z.string().nullable(),
    // Kept when an officer is chosen (the server takes the name from the
    // officer's record), so it is only required for someone not on the books.
    officerName: z.string(),
    officerRank: z.string(),
    unit: z.string(),
    shiftStart: z.number(),
    shiftEnd: z.number(),
    notes: z.string(),
  })
  .refine((value) => value.officerId || value.officerName.trim(), {
    error: () => m["validation.choose_an_officer_or_enter_a_name"](),
    path: ['officerName'],
  })
  .refine((value) => value.shiftEnd > value.shiftStart, {
    error: () => m["validation.shift_end_must_be_after_shift_start"](),
    path: ['shiftEnd'],
  })

export type CreateDutyAssignmentInput = z.infer<typeof createDutyAssignmentSchema>
