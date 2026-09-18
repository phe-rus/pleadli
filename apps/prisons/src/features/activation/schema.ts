import * as z from 'zod'

export const hqRoleSchema = z.enum(['facility', 'head_office'])
export type HqRole = z.infer<typeof hqRoleSchema>
