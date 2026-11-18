import * as z from 'zod'

export const ruleSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  terms: z.array(z.string()).default([]),
  exceptions: z.array(z.string()).default([]),
  value: z.number().nullable().optional(),
  text: z.string().nullable().optional(),
  citation: z.string().nullable().optional(),
  status: z.enum(['draft', 'sourced', 'reviewed']),
  reviewedBy: z.string().nullable().optional(),
  reviewedOn: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
})

export const packSchema = z.object({
  country: z.string(),
  name: z.string(),
  version: z.number(),
  updatedOn: z.string(),
  rules: z.array(ruleSchema),
})

export type Rule = z.infer<typeof ruleSchema>
export type Pack = z.infer<typeof packSchema>
