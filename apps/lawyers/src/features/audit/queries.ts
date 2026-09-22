import { queryOptions, useQuery } from '@tanstack/react-query'
import { getAudit, verifyAudit } from './data'

export const auditOptions = (matterId?: string, limit = 50) => queryOptions({ queryKey: ['audit', matterId ?? 'all', limit] as const, queryFn: () => getAudit(matterId, limit) })
export const verificationOptions = () => queryOptions({ queryKey: ['audit', 'verify'] as const, queryFn: () => verifyAudit() })

export const useAudit = (matterId?: string, limit = 50) => useQuery(auditOptions(matterId, limit))
export const useVerification = () => useQuery(verificationOptions())
