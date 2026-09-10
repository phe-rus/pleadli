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
})

export type Attachment = z.infer<typeof attachmentSchema>

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
