import { personSchema } from '@/features/people/schema'
import * as z from 'zod'

// The record types `bulk_import` accepts, mirroring Rust's
// `import::import_fields` match arms exactly, so a type picked here is
// always one the backend actually knows how to import.
export const importableEntityTypes = [
  { value: 'person', label: 'Person' },
  { value: 'case', label: 'Case' },
  { value: 'statement', label: 'Statement' },
  { value: 'custody_record', label: 'Custody record' },
  { value: 'bond', label: 'Bond' },
  { value: 'exhibit', label: 'Evidence' },
  { value: 'charge_sheet', label: 'Charge sheet' },
  { value: 'referral', label: 'Referral' },
  { value: 'station_diary_entry', label: 'Station diary entry' },
  { value: 'duty_assignment', label: 'Duty assignment' },
  { value: 'station_asset', label: 'Station asset' },
  { value: 'station_establishment_member', label: 'Station establishment' },
] as const

export type ImportableEntityType = (typeof importableEntityTypes)[number]['value']

export const importFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean(),
})

export type ImportField = z.infer<typeof importFieldSchema>

// A pseudo-field's `key` marks it as something `import_fields` exposes
// but that doesn't map straight onto a spreadsheet column value — it
// gets resolved into a real `personId`/`caseId` before the row is ever
// sent to `bulk_import`. Matching `domain::import::import_fields`'s
// pseudo-field keys exactly.
const PERSON_REF_KEYS = ['personFirstName', 'personLastName', 'personNationalId'] as const
const CASE_REF_KEY = 'caseReference'

export function isPersonRefField(key: string): key is (typeof PERSON_REF_KEYS)[number] {
  return (PERSON_REF_KEYS as readonly string[]).includes(key)
}

export function isCaseRefField(key: string) {
  return key === CASE_REF_KEY
}

export const importPreviewSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
})

export type ImportPreview = z.infer<typeof importPreviewSchema>

export const personResolutionSchema = z.object({
  key: z.string(),
  exactMatch: personSchema.nullable(),
  candidates: z.array(personSchema),
})

export type PersonResolution = z.infer<typeof personResolutionSchema>

export const caseResolutionSchema = z.object({
  reference: z.string(),
  matchedCaseId: z.string().nullable(),
})

export type CaseResolution = z.infer<typeof caseResolutionSchema>

export const importRowFailureSchema = z.object({
  row: z.number(),
  error: z.string(),
})

export const bulkImportResultSchema = z.object({
  imported: z.number(),
  failed: z.array(importRowFailureSchema),
})

export type BulkImportResult = z.infer<typeof bulkImportResultSchema>
