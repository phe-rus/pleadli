import { queryOptions, useQuery } from '@tanstack/react-query'
import { getSecurityStatus, listAudit } from './data'

export const securityStatusOptions = () => queryOptions({ queryKey: ['security', 'status'] as const, queryFn: getSecurityStatus, retry: false, staleTime: 0 })

/** Polled, so an app that locked itself while idle shows the lock. */
export const useSecurityStatus = () => useQuery({ ...securityStatusOptions(), refetchInterval: 15_000, refetchOnWindowFocus: true })

export const useAudit = (limit = 25) => useQuery({ queryKey: ['security', 'audit', limit] as const, queryFn: () => listAudit(limit) })
