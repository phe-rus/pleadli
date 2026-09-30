import * as m from '@/paraglide/messages'
import * as z from 'zod'

// A plain string discriminator, not a Rust/TS enum — matches the DB column,
// which can't foreign-key to more than one table.
export const entityTypes = {
  person: 'person',
  stationDiaryEntry: 'station_diary_entry',
  incident: 'incident',
  dutyAssignment: 'duty_assignment',
  stationAsset: 'station_asset',
  case: 'case',
  statement: 'statement',
  custodyRecord: 'custody_record',
  bond: 'bond',
  exhibit: 'exhibit',
  chargeSheet: 'charge_sheet',
  referral: 'referral',
  vehicle: 'vehicle',
} as const

export type EntityType = (typeof entityTypes)[keyof typeof entityTypes]

export const attachmentSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  fileName: z.string(),
  storedPath: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  createdAt: z.number(),
  photoAngle: z.string().nullable(),
})

export type Attachment = z.infer<typeof attachmentSchema>

// The four identification-photo slots a person record can carry: a
// proper mugshot set (front, both profiles, back) rather than one
// arbitrary "best" photo starred out of a generic file list.
export const personPhotoAngles = [
  { value: 'front', get label() { return m["attachments.angle.front"]() } },
  { value: 'left_profile', get label() { return m["attachments.angle.left_profile"]() } },
  { value: 'right_profile', get label() { return m["attachments.angle.right_profile"]() } },
  { value: 'back', get label() { return m["attachments.angle.back"]() } },
] as const

export type PersonPhotoAngle = (typeof personPhotoAngles)[number]['value']

export const bulkAttachFailureSchema = z.object({
  source: z.string(),
  error: z.string(),
})

export const bulkAttachResultSchema = z.object({
  attached: z.array(attachmentSchema),
  failed: z.array(bulkAttachFailureSchema),
})

export type BulkAttachResult = z.infer<typeof bulkAttachResultSchema>

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
