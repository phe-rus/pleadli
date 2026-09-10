import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createReferralSchema, referralSchema, type CreateReferralInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createReferral(input: CreateReferralInput) {
  const parsed = createReferralSchema.parse(input)
  const referral = isTauri()
    ? await invoke('create_referral', { input: parsed })
    : await devFetch('/referrals', { method: 'POST', body: JSON.stringify(parsed) })
  return referralSchema.parse(referral)
}

export async function updateReferral(id: string, input: CreateReferralInput) {
  const parsed = createReferralSchema.parse(input)
  const referral = isTauri()
    ? await invoke('update_referral', { id, input: parsed })
    : await devFetch(`/referrals/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return referralSchema.parse(referral)
}

export async function listReferrals(query: string) {
  const referrals = isTauri()
    ? await invoke('list_referrals', { query })
    : await devFetch(`/referrals?query=${encodeURIComponent(query)}`)
  return z.array(referralSchema).parse(referrals)
}
