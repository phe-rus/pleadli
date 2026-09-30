import * as z from 'zod'

export const filingSchema = z.object({
  id: z.string(),
  matterId: z.string(),
  filedOn: z.number(),
  court: z.string().nullable(),
  courtReference: z.string().nullable(),
  feeAmount: z.number().nullable(),
  feePrn: z.string().nullable(),
  servedOn: z.number().nullable(),
  servedTo: z.string().nullable(),
  serviceMethod: z.string().nullable(),
  serviceNote: z.string().nullable(),
  filedBy: z.string(),
  createdAt: z.number(),
  documents: z.array(z.object({ id: z.string(), kind: z.string(), title: z.string(), reference: z.string().nullable(), position: z.number() })),
})
export type Filing = z.infer<typeof filingSchema>
