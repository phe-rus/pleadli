import { invoke, isTauri } from '@tauri-apps/api/core'
import { prosecutorProfileSchema, saveProsecutorProfileSchema, type SaveProsecutorProfileInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function getProsecutorProfile() {
  const profile = isTauri() ? await invoke('get_prosecutor_profile') : await devFetch('/prosecutor-profile')
  return prosecutorProfileSchema.nullable().parse(profile)
}

export async function saveProsecutorProfile(input: SaveProsecutorProfileInput) {
  const parsed = saveProsecutorProfileSchema.parse(input)
  const profile = isTauri()
    ? await invoke('save_prosecutor_profile', { input: parsed })
    : await devFetch('/prosecutor-profile', { method: 'POST', body: JSON.stringify(parsed) })
  return prosecutorProfileSchema.parse(profile)
}
