import * as z from 'zod'
import { api, orNull, seg } from '@/lib/api'
import { chargeSchema, createChargeSchema, type CreateChargeInput } from './schema'

export async function createCharge(input: CreateChargeInput) {
  const parsed = createChargeSchema.parse(input)
  const body = { ...parsed, statutorySection: orNull(parsed.statutorySection), particulars: orNull(parsed.particulars) }
  return chargeSchema.parse(await api('POST', '/api/charges', { body }))
}

export async function listChargesForFile(prosecutionFileId: string) {
  return z.array(chargeSchema).parse(await api('GET', `/api/prosecution-files/${seg(prosecutionFileId)}/charges`))
}
