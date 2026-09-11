import * as z from 'zod'

export const courtProductionSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  courtReference: z.string().nullable(),
  productionDate: z.number(),
  purpose: z.string().nullable(),
  createdAt: z.number(),
})

export type CourtProduction = z.infer<typeof courtProductionSchema>

export const createCourtProductionSchema = z.object({
  prisonerId: z.string().min(1),
  courtReference: z.string(),
  productionDate: z.number(),
  purpose: z.string(),
})

export type CreateCourtProductionInput = z.infer<typeof createCourtProductionSchema>

export const remandListEntrySchema = z.object({
  prisonerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  admittedAt: z.number(),
  admissionAuthority: z.string().nullable(),
  highCourtOnlyOffence: z.boolean(),
  lastProducedAt: z.number().nullable(),
})

export type RemandListEntry = z.infer<typeof remandListEntrySchema>
