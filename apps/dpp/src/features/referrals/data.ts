import * as z from 'zod'
import { api, orNull, seg } from '@/lib/api'
import { createResubmissionSchema, referralSchema, type CreateResubmissionInput } from './schema'

export async function createResubmission(input: CreateResubmissionInput) {
  const parsed = createResubmissionSchema.parse(input)
  const body = {
    ...parsed,
    policeStation: orNull(parsed.policeStation),
    policeReference: orNull(parsed.policeReference),
    materialSummary: orNull(parsed.materialSummary),
    notes: orNull(parsed.notes),
  }
  return referralSchema.parse(await api('POST', '/api/referrals/resubmission', { body }))
}

export async function listReferralsForFile(prosecutionFileId: string) {
  return z.array(referralSchema).parse(await api('GET', `/api/prosecution-files/${seg(prosecutionFileId)}/referrals`))
}
