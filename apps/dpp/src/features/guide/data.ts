import * as z from 'zod'
import { api, seg } from '@/lib/api'

export const offenceSchema = z.object({
  id: z.string(),
  jurisdiction: z.string(),
  title: z.string(),
  sectionRefs: z.string().nullable(),
  chargeWording: z.string().nullable(),
  particularsTemplate: z.string().nullable(),
  proving: z.array(z.string()),
  papers: z.array(z.string()),
  gaps: z.array(z.string()),
  words: z.array(z.string()),
  source: z.enum(['starter', 'office']),
  starterKey: z.string().nullable(),
  state: z.enum(['in_use', 'waiting_for_director']),
  updatedBy: z.string().nullable(),
  updatedAt: z.number(),
  createdAt: z.number(),
})
export type Offence = z.infer<typeof offenceSchema>

export const versionSchema = z.object({
  id: z.string(),
  offenceId: z.string(),
  snapshot: z.record(z.string(), z.unknown()),
  changedBy: z.string().nullable(),
  changedAt: z.number(),
  note: z.string().nullable(),
})
export type Version = z.infer<typeof versionSchema>

export type OffenceInput = {
  jurisdiction?: string
  title: string
  sectionRefs: string | null
  chargeWording: string | null
  particularsTemplate: string | null
  proving: string[]
  papers: string[]
  gaps: string[]
  words: string[]
  state?: Offence['state']
  note?: string | null
}

export const listGuide = async (jurisdiction: string) => z.array(offenceSchema).parse(await api('GET', '/api/guide/offences', { query: { jurisdiction } }))
export const createOffence = async (input: OffenceInput) => offenceSchema.parse(await api('POST', '/api/guide/offences', { body: input }))
export const updateOffence = async (id: string, input: OffenceInput) => offenceSchema.parse(await api('PUT', `/api/guide/offences/${seg(id)}`, { body: input }))
export const archiveOffence = (id: string) => api('DELETE', `/api/guide/offences/${seg(id)}`)
export const listVersions = async (id: string) => z.array(versionSchema).parse(await api('GET', `/api/guide/offences/${seg(id)}/versions`))
export const restoreVersion = async (versionId: string) => offenceSchema.parse(await api('POST', `/api/guide/versions/${seg(versionId)}/restore`))
export const restoreStarter = async (id: string) => offenceSchema.parse(await api('POST', `/api/guide/offences/${seg(id)}/restore-starter`))
