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
    message: 'Choose an officer or enter a name.',
    path: ['officerName'],
  })
  .refine((value) => value.shiftEnd > value.shiftStart, {
    message: 'Shift end must be after shift start.',
    path: ['shiftEnd'],
  })

export type CreateDutyAssignmentInput = z.infer<typeof createDutyAssignmentSchema>
