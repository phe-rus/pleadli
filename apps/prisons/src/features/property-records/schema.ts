import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const propertyRecordSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  description: z.string(),
  recordedAt: z.number(),
  returnedAt: z.number().nullable(),
  returnedNote: z.string().nullable(),
  createdAt: z.number(),
})

export type PropertyRecord = z.infer<typeof propertyRecordSchema>

export const createPropertyRecordSchema = z.object({
  prisonerId: z.string().min(1),
  description: z.string().min(1, { error: () => m.validation_property_description_required() }),
  recordedAt: z.number(),
})

export type CreatePropertyRecordInput = z.infer<typeof createPropertyRecordSchema>

export const returnPropertyRecordSchema = z.object({
  returnedAt: z.number(),
  returnedNote: z.string(),
})

export type ReturnPropertyRecordInput = z.infer<typeof returnPropertyRecordSchema>
