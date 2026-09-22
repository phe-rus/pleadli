import { api } from '@/lib/api'
import * as z from 'zod'
import { createReferralSchema, referralSchema, type CreateReferralInput } from './schema'

export async function createReferral(input: CreateReferralInput) {
  const parsed = createReferralSchema.parse(input)
  const referral = await api('/referrals', { method: 'POST', body: JSON.stringify(parsed) })
  return referralSchema.parse(referral)
}

export async function updateReferral(id: string, input: CreateReferralInput) {
  const parsed = createReferralSchema.parse(input)
  const referral = await api(`/referrals/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return referralSchema.parse(referral)
}

export async function listReferrals(query: string) {
  const referrals = await api(`/referrals?query=${encodeURIComponent(query)}`)
  return z.array(referralSchema).parse(referrals)
}
