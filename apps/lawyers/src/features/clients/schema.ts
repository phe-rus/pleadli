import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const custodyOptions = [
  { id: 'at_liberty', get label() { return m["client.custody.at_liberty"]() } },
  { id: 'remanded', get label() { return m["client.custody.remanded"]() } },
  { id: 'serving', get label() { return m["client.custody.serving"]() } },
] as const

export const clientKinds = ['person', 'organisation'] as const
export type ClientKind = (typeof clientKinds)[number]
export const custodyLabel = (id: string) => custodyOptions.find((c) => c.id === id)?.label ?? id

export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(clientKinds),
  phone: z.string().nullable(),
  email: z.string().nullable(),
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
  kind: z.enum(clientKinds),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  custody: z.string().nullable(),
  custodyPlace: z.string().nullable(),
  notes: z.string().nullable(),
  matters: z.number(),
  openMatters: z.number(),
  createdAt: z.number(),
})
export type ClientSummary = z.infer<typeof clientSummarySchema>

export type ClientInput = { name: string; kind: ClientKind; phone: string | null; email: string | null; address: string | null; custody: string | null; custodyPlace: string | null; notes: string | null }
export const clientFormSchema = () => z.object({ name: z.string().trim().min(1, m["client.form.name_required"]()) })
