import * as z from 'zod'
import { api, orNull, seg } from '@/lib/api'
import {
  createProsecutionFileSchema,
  fileSummarySchema,
  prosecutionFilePersonSchema,
  prosecutionFileSchema,
  updateProsecutionFileSchema,
  type CreateProsecutionFileInput,
  type FileViewId,
  type UpdateProsecutionFileInput,
} from './schema'

function toCreateBody(input: CreateProsecutionFileInput) {
  return {
    ...input,
    odppRegistrationNumber: orNull(input.odppRegistrationNumber),
    policeStation: orNull(input.policeStation),
    policeReference: orNull(input.policeReference),
    materialSummary: orNull(input.materialSummary),
    notes: orNull(input.notes),
  }
}

function toUpdateBody(input: UpdateProsecutionFileInput) {
  return {
    ...input,
    odppRegistrationNumber: orNull(input.odppRegistrationNumber),
    policeStation: orNull(input.policeStation),
    policeReference: orNull(input.policeReference),
    courtCaseNumber: orNull(input.courtCaseNumber),
    notes: orNull(input.notes),
  }
}

export async function createProsecutionFile(input: CreateProsecutionFileInput) {
  const body = toCreateBody(createProsecutionFileSchema.parse(input))
  return prosecutionFileSchema.parse(await api('POST', '/api/prosecution-files', { body }))
}

export async function updateProsecutionFile(id: string, input: UpdateProsecutionFileInput) {
  const body = toUpdateBody(updateProsecutionFileSchema.parse(input))
  return prosecutionFileSchema.parse(await api('PUT', `/api/prosecution-files/${seg(id)}`, { body }))
}

/** The register, or one slice of it, with what the work on each file amounts to. */
export async function listFiles(view: FileViewId | 'awaiting', query = '') {
  return z.array(fileSummarySchema).parse(await api('GET', '/api/prosecution-files', { query: { view, query } }))
}

export async function getProsecutionFile(id: string) {
  return prosecutionFileSchema.nullable().parse(await api('GET', `/api/prosecution-files/${seg(id)}`))
}

export async function linkPersonToFile(prosecutionFileId: string, personId: string, role: string) {
  const link = await api('POST', `/api/prosecution-files/${seg(prosecutionFileId)}/people`, { body: { personId, role } })
  return prosecutionFilePersonSchema.parse(link)
}

export async function unlinkPersonFromFile(id: string) {
  await api('DELETE', `/api/prosecution-file-people/${seg(id)}`)
}

export async function listFilePeople(prosecutionFileId: string) {
  return z.array(prosecutionFilePersonSchema).parse(await api('GET', `/api/prosecution-files/${seg(prosecutionFileId)}/people`))
}
