import * as m from '@/paraglide/messages'
import { personSchema } from '@/features/people/schema'
import * as z from 'zod'

// The record types `bulk_import` accepts, mirroring Rust's
// `import::import_fields` match arms exactly, so a type picked here is
// always one the backend actually knows how to import.
export const importableEntityTypes = [
  { value: 'person', get label() { return m["data_io.entity.person"]() } },
  { value: 'case', get label() { return m["data_io.entity.case"]() } },
  { value: 'statement', get label() { return m["data_io.entity.statement"]() } },
  { value: 'custody_record', get label() { return m["data_io.entity.custody_record"]() } },
  { value: 'bond', get label() { return m["data_io.entity.bond"]() } },
  { value: 'exhibit', get label() { return m["data_io.entity.evidence"]() } },
  { value: 'charge_sheet', get label() { return m["data_io.entity.charge_sheet"]() } },
  { value: 'referral', get label() { return m["data_io.entity.referral"]() } },
  { value: 'station_diary_entry', get label() { return m["data_io.entity.station_diary_entry"]() } },
  { value: 'duty_assignment', get label() { return m["data_io.entity.duty_assignment"]() } },
  { value: 'station_asset', get label() { return m["data_io.entity.station_asset"]() } },
  { value: 'officer', get label() { return m["data_io.entity.officers"]() } },
  { value: 'vehicle', get label() { return m["data_io.entity.vehicle"]() } },
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
