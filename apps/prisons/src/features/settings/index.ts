import { peerSyncConfigOptions } from '@/features/facilities'
import { authPolicyOptions } from '@/features/auth-policy'
import { cloudflareConfigOptions } from '@/features/network'
import { backupsOptions } from '@/features/node'
import type { QueryClient } from '@tanstack/react-query'

export * from './sections'
export * from './settings-shell'

/** Each of these needs a different permission, and Settings renders fine
 * without any of them, so a refusal is not an error. */
export async function preloadSettings(queryClient: QueryClient) {
  await Promise.allSettled([
    queryClient.query({ ...peerSyncConfigOptions(), staleTime: 'static' }),
    queryClient.query({ ...cloudflareConfigOptions(), staleTime: 'static' }),
    queryClient.query({ ...backupsOptions(), staleTime: 'static' }),
    queryClient.query({ ...authPolicyOptions(), staleTime: 'static' }),
  ])
}
