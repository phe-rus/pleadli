import * as z from 'zod'
import { api, seg } from '@/lib/api'
import { activityEventSchema, capacitySchema, materialRowSchema, workloadSchema, type MaterialKind } from './schema'

export async function getWorkload() {
  return workloadSchema.parse(await api('GET', '/api/workload'))
}

/** What has happened across the whole installation, newest first. */
export async function listActivity(limit = 30) {
  return z.array(activityEventSchema).parse(await api('GET', '/api/activity', { query: { limit } }))
}

/** What has happened on one file, read back from the records themselves. */
export async function listChronology(fileId: string) {
  return z.array(activityEventSchema).parse(await api('GET', `/api/prosecution-files/${seg(fileId)}/chronology`))
}

export async function listMaterial(kind: MaterialKind) {
  return z.array(materialRowSchema).parse(await api('GET', '/api/material', { query: { kind } }))
}

/** Workload over the last `months` calendar months, counted from the record. */
export async function getCapacity(months: number) {
  return capacitySchema.parse(await api('GET', '/api/capacity', { query: { months } }))
}
