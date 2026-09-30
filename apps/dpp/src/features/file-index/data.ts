import * as z from 'zod'
import { api, seg } from '@/lib/api'

export const fileItemSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  kind: z.string(),
  title: z.string(),
  documentDate: z.number().nullable(),
  attachmentId: z.string().nullable(),
  pageFrom: z.number().nullable(),
  pageTo: z.number().nullable(),
  summary: z.string().nullable(),
  body: z.string().nullable(),
  people: z.string().nullable(),
  position: z.number(),
  source: z.enum(['person', 'assist', 'police']),
  confirmedBy: z.string().nullable(),
  confirmedAt: z.number().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type FileItem = z.infer<typeof fileItemSchema>

export type NewFileItem = {
  prosecutionFileId: string
  kind: string
  title: string
  documentDate?: number | null
  attachmentId?: string | null
  pageFrom?: number | null
  pageTo?: number | null
  summary?: string | null
  body?: string | null
  people?: string | null
}

export type FileItemChange = {
  kind?: string
  title?: string
  documentDate?: number | null
  summary?: string | null
  body?: string | null
  position?: number
  confirm?: boolean
}

export const listFileItems = async (fileId: string) => z.array(fileItemSchema).parse(await api('GET', '/api/file-items', { query: { fileId } }))
export const createFileItem = async (item: NewFileItem) => fileItemSchema.parse(await api('POST', '/api/file-items', { body: item }))
export const updateFileItem = async (id: string, change: FileItemChange) => fileItemSchema.parse(await api('PATCH', `/api/file-items/${seg(id)}`, { body: change }))
export const deleteFileItem = (id: string) => api('DELETE', `/api/file-items/${seg(id)}`)
export const confirmFileItems = (fileId: string) => api('POST', '/api/file-items/confirm', { body: { fileId } })
