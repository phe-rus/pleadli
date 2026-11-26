import * as z from 'zod'
import { api, seg } from '@/lib/api'

export const registers = ['incoming', 'outgoing', 'movement'] as const
export type RegisterId = (typeof registers)[number]
export const isRegister = (v: unknown): v is RegisterId => registers.includes(v as RegisterId)

export const entrySchema = z.object({
  id: z.string(),
  register: z.string(),
  year: z.number(),
  number: z.number(),
  prosecutionFileId: z.string(),
  fileTitle: z.string(),
  odppRegistrationNumber: z.string().nullable(),
  policeReference: z.string().nullable(),
  occurredAt: z.number(),
  fromTo: z.string().nullable(),
  givenTo: z.string().nullable(),
  note: z.string().nullable(),
  stamps: z.array(z.object({ label: z.string(), by: z.string().nullable(), at: z.number() })),
  actor: z.string().nullable(),
  createdAt: z.number(),
})
export type RegisterEntry = z.infer<typeof entrySchema>

export const holderSchema = z.object({ staffId: z.string().nullable(), name: z.string().nullable(), files: z.number() })

export const listEntries = async (register: RegisterId, year: number) => z.array(entrySchema).parse(await api('GET', '/api/registry/entries', { query: { register, year: String(year) } }))
export const listYears = async () => z.array(z.number()).parse(await api('GET', '/api/registry/years'))
export const listHolders = async () => z.array(holderSchema).parse(await api('GET', '/api/registry/holders'))
export const giveOut = (input: { prosecutionFileId: string; staffId?: string | null; givenTo?: string | null; note?: string | null }) => api('POST', '/api/registry/give-out', { body: input })
export const stampEntry = (id: string, label: string) => api('POST', `/api/registry/entries/${seg(id)}/stamps`, { body: { label } })
