import { createServerFn } from '@tanstack/react-start'
import { fetchRelease, RELEASE_APPS, type ReleaseAvailability } from './releases.server'

/** Public metadata only. No credentials or institution records are involved. */
export const getReleases = createServerFn({ method: 'GET' }).handler(async (): Promise<Record<string, ReleaseAvailability>> => {
  const entries = await Promise.all(RELEASE_APPS.map(async (app) => [app, await fetchRelease(app)] as const))
  return Object.fromEntries(entries)
})
