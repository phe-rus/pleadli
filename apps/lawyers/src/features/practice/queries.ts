import { useMutation, useSuspenseQuery, queryOptions } from '@tanstack/react-query'
import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { matterNoteSchema, timeEntrySchema } from '../matters/schema'

export const useAddNote = () =>
  useMutation({ mutationFn: async (v: { matterId: string; body: string }) => matterNoteSchema.parse(await api('POST', `/api/matters/${seg(v.matterId)}/notes`, { body: { body: v.body } })) })
export const useUpdateNote = () => useMutation({ mutationFn: async (v: { id: string; body: string }) => matterNoteSchema.parse(await api('PUT', `/api/notes/${seg(v.id)}`, { body: { body: v.body } })) })
export const useRemoveNote = () => useMutation({ mutationFn: async (id: string) => void (await api('DELETE', `/api/notes/${seg(id)}`)) })

export type TimeInput = { workedOn: number; minutes: number; description: string }
export const useAddTime = () =>
  useMutation({ mutationFn: async (v: { matterId: string; input: TimeInput }) => timeEntrySchema.parse(await api('POST', `/api/matters/${seg(v.matterId)}/time`, { body: v.input })) })
export const useRemoveTime = () => useMutation({ mutationFn: async (id: string) => void (await api('DELETE', `/api/time/${seg(id)}`)) })

export const timeOptions = (from: number, to: number) =>
  queryOptions({ queryKey: ['time', from, to] as const, queryFn: async () => z.array(timeEntrySchema).parse(await api('GET', '/api/time', { query: { from, to } })) })
export const useTime = (from: number, to: number) => useSuspenseQuery(timeOptions(from, to))

/** `90`, `1h30`, `1:30`, `1.5h` or `45m` as minutes; null when it is none of these. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  let m = /^(\d+)$/.exec(t)
  if (m) return Number(m[1])
  m = /^(\d+):(\d{1,2})$/.exec(t)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = /^(\d+)h(?:(\d{1,2})m?)?$/.exec(t)
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0)
  m = /^(\d+(?:\.\d+)?)h$/.exec(t)
  if (m) return Math.round(Number(m[1]) * 60)
  m = /^(\d+)m$/.exec(t)
  if (m) return Number(m[1])
  return null
}

export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}
