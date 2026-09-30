import { api, seg } from '@/lib/api'
import { getLocale } from '@/paraglide/runtime'
import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import * as z from 'zod'

export const paperKinds = ['pleading', 'court_document', 'letter', 'contract', 'receipt', 'identity', 'evidence', 'other'] as const
export type PaperKind = (typeof paperKinds)[number]

export const paperSchema = z.object({
  id: z.string(),
  matterId: z.string(),
  title: z.string(),
  kind: z.enum(paperKinds),
  dated: z.string().nullable(),
  fromWhom: z.string().nullable(),
  summary: z.string().nullable(),
  hasTranscript: z.boolean(),
  assisted: z.boolean(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  addedBy: z.string().nullable(),
  createdAt: z.number(),
})
export type Paper = z.infer<typeof paperSchema>

const foundSchema = z.object({ event: z.string(), on: z.string(), note: z.string().nullable(), paperId: z.string() })
export type Found = z.infer<typeof foundSchema>
const readSchema = z.object({ papers: z.array(paperSchema), found: z.array(foundSchema), model: z.string() })

export type PaperEdit = { title: string; kind: PaperKind; dated: string | null; fromWhom: string | null; summary: string | null }

/** A file as base64, for the JSON API (the desktop app carries JSON only). */
async function base64Of(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export const papersOptions = (matterId: string) =>
  queryOptions({ queryKey: ['papers', matterId] as const, queryFn: async () => z.array(paperSchema).parse(await api('GET', `/api/matters/${seg(matterId)}/papers`)) })
export const usePapers = (matterId: string) => useQuery(papersOptions(matterId))

export const paperTextOptions = (id: string) =>
  queryOptions({ queryKey: ['paper', id] as const, queryFn: async () => paperSchema.extend({ transcript: z.string().nullable() }).parse(await api('GET', `/api/papers/${seg(id)}`)) })

export async function paperFile(id: string) {
  return z.object({ fileName: z.string(), mimeType: z.string(), data: z.string() }).parse(await api('GET', `/api/papers/${seg(id)}/file`))
}

export const useAddPaper = () =>
  useMutation({ mutationFn: async (v: { matterId: string; file: File }) => paperSchema.parse(await api('POST', `/api/matters/${seg(v.matterId)}/papers`, { body: { fileName: v.file.name, data: await base64Of(v.file) } })) })
export const useEditPaper = () => useMutation({ mutationFn: async (v: { id: string; input: PaperEdit }) => paperSchema.parse(await api('PUT', `/api/papers/${seg(v.id)}`, { body: v.input })) })
export const useRemovePaper = () => useMutation({ mutationFn: (id: string) => api('DELETE', `/api/papers/${seg(id)}`) })
export const useReadPapers = () =>
  useMutation({ mutationFn: async (v: { matterId: string; paperIds: string[] }) => readSchema.parse(await api('POST', `/api/matters/${seg(v.matterId)}/papers/read`, { body: { paperIds: v.paperIds, language: getLocale() } })) })
