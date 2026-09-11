import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createReleaseSchema, releaseSchema, type CreateReleaseInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createRelease(input: CreateReleaseInput) {
  const parsed = createReleaseSchema.parse(input)
  const rustInput = { ...parsed, orderedBy: parsed.orderedBy || null, notes: parsed.notes || null }
  const release = isTauri()
    ? await invoke('create_release', { input: rustInput })
    : await devFetch('/releases', { method: 'POST', body: JSON.stringify(rustInput) })
  return releaseSchema.parse(release)
}

export async function listReleasesForPrisoner(prisonerId: string) {
  const releases = isTauri()
    ? await invoke('list_releases_for_prisoner', { prisonerId })
    : await devFetch(`/prisoners/${encodeURIComponent(prisonerId)}/releases`)
  return z.array(releaseSchema).parse(releases)
}
