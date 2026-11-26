import { queryOptions, useQuery } from '@tanstack/react-query'
import { getGrants, getMyCapabilities } from './data'
import type { Capabilities } from './schema'

/** Keyed under `workload` so signing in as someone else or changing a grant refreshes it with the counts. */
export const myCapabilitiesOptions = () => queryOptions({ queryKey: ['workload', 'capabilities'] as const, queryFn: getMyCapabilities })
export const grantsOptions = () => queryOptions({ queryKey: ['capabilities', 'grants'] as const, queryFn: getGrants })

const none: Capabilities = { registerFiles: false, allocateFiles: false, reassignFiles: false, selfAssign: false, reviewFiles: false, approveDirectorDecisions: false, administer: false }

/** What the person signed in may do. Nothing until it is known, so a button never flashes up that then fails. */
export function useCapabilities(): Capabilities {
  const { data } = useQuery(myCapabilitiesOptions())
  return data ?? none
}
