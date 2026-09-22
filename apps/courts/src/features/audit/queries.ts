import { queryOptions, useQuery } from '@tanstack/react-query'
import { getAudit, verifyAudit } from './data'

export const auditOptions = (caseId?: string, limit = 50) => queryOptions({ queryKey: ['audit', caseId ?? 'all', limit] as const, queryFn: () => getAudit(caseId, limit) })
export const verificationOptions = () => queryOptions({ queryKey: ['audit', 'verify'] as const, queryFn: () => verifyAudit() })

export const useAudit = (caseId?: string, limit = 50) => useQuery(auditOptions(caseId, limit))
export const useVerification = () => useQuery(verificationOptions())
