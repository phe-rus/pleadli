import * as z from 'zod'

export const custodyOptions = [
  { id: 'at_liberty', label: 'At liberty' },
  { id: 'remanded', label: 'Remanded' },
  { id: 'serving', label: 'Serving a sentence' },
] as const
export const custodyLabel = (id: string) => custodyOptions.find((c) => c.id === id)?.label ?? id

export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  custody: z.string().nullable(),
  custodyPlace: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Client = z.infer<typeof clientSchema>

export const clientSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  custody: z.string().nullable(),
  custodyPlace: z.string().nullable(),
  notes: z.string().nullable(),
  matters: z.number(),
  openMatters: z.number(),
  createdAt: z.number(),
})
export type ClientSummary = z.infer<typeof clientSummarySchema>

export type ClientInput = { name: string; phone: string | null; address: string | null; custody: string | null; custodyPlace: string | null; notes: string | null }
export const clientFormSchema = z.object({ name: z.string().trim().min(1, 'A client needs a name.') })
