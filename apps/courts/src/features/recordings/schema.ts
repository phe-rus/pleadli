import * as z from 'zod'

export const recordingSchema = z.object({
  id: z.string(),
  sittingId: z.string(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  status: z.enum(['recording', 'stopped', 'interrupted']),
  mimeType: z.string(),
  finalChainSha256: z.string().nullable(),
  createdBy: z.string().nullable(),
  chunks: z.number(),
  bytes: z.number(),
  durationMs: z.number(),
})
export type Recording = z.infer<typeof recordingSchema>

export const chunkSchema = z.object({
  id: z.string(),
  recordingId: z.string(),
  seq: z.number(),
  offsetMs: z.number(),
  durationMs: z.number(),
  bytes: z.number(),
  sha256: z.string(),
  chainSha256: z.string(),
  createdAt: z.number(),
})

export const checkSchema = z.object({ intact: z.boolean(), chunks: z.number(), brokenAt: z.number().nullable(), reason: z.string().nullable() })
export type Check = z.infer<typeof checkSchema>

export const audioSchema = z.object({ mimeType: z.string(), dataBase64: z.string() })

export const segmentSchema = z.object({
  id: z.string(),
  recordingId: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  speaker: z.string().nullable(),
  channel: z.string().nullable(),
  text: z.string(),
  state: z.enum(['draft', 'edited', 'adopted']),
  source: z.enum(['machine', 'manual']),
  engine: z.string().nullable(),
  adoptedNoteId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Segment = z.infer<typeof segmentSchema>

export const transcriptionStatusSchema = z.object({ available: z.boolean(), engine: z.string().nullable(), reason: z.string() })

export type SegmentInput = { startMs: number; endMs: number; speaker: string | null; channel: string | null; text: string }

export const segmentStateLabels: Record<Segment['state'], string> = {
  draft: 'Machine draft',
  edited: 'Edited by a person',
  adopted: 'In the bench record',
}

/** `1:02:03` or `12:31` or `45`, as milliseconds; null when it is not a time. */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(':')
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null
  const numbers = parts.map(Number)
  const [h, m, s] = numbers.length === 3 ? numbers : numbers.length === 2 ? [0, ...numbers] : [0, 0, numbers[0]]
  return ((h * 60 + m) * 60 + s) * 1000
}

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
