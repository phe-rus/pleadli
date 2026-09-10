import * as z from 'zod'

export const dutyAssignmentSchema = z.object({
  id: z.string(),
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
    officerName: z.string().min(1, 'Officer name is required.'),
    officerRank: z.string(),
    unit: z.string(),
    shiftStart: z.number(),
    shiftEnd: z.number(),
    notes: z.string(),
  })
  .refine((value) => value.shiftEnd > value.shiftStart, {
    message: 'Shift end must be after shift start.',
    path: ['shiftEnd'],
  })

export type CreateDutyAssignmentInput = z.infer<typeof createDutyAssignmentSchema>
