import * as z from 'zod'
import { officerSchema } from '@/features/officers'

export const hqConfigSchema = z.object({
  isHeadOffice: z.boolean(),
  role: z.enum(['facility', 'head_office']).nullable(),
  activatedAt: z.number().nullable(),
})

export type HqConfig = z.infer<typeof hqConfigSchema>

export const hqSessionSchema = officerSchema.nullable()
