import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createResubmissionSchema, referralSchema, type CreateResubmissionInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createResubmission(input: CreateResubmissionInput) {
  const parsed = createResubmissionSchema.parse(input)
  const rustInput = {
    ...parsed,
    policeStation: parsed.policeStation || null,
    policeReference: parsed.policeReference || null,
    materialSummary: parsed.materialSummary || null,
    notes: parsed.notes || null,
  }
  const referral = isTauri()
    ? await invoke('create_resubmission', { input: rustInput })
    : await devFetch('/referrals/resubmission', { method: 'POST', body: JSON.stringify(rustInput) })
  return referralSchema.parse(referral)
}

export async function listReferralsForFile(prosecutionFileId: string) {
  const referrals = isTauri()
    ? await invoke('list_referrals_for_file', { prosecutionFileId })
    : await devFetch(`/prosecution-files/${encodeURIComponent(prosecutionFileId)}/referrals`)
  return z.array(referralSchema).parse(referrals)
}
