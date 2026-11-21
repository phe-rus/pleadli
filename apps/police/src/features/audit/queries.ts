import { useQuery } from '@tanstack/react-query'
import { getAudit, verifyAudit } from './data'

export const useAudit = (limit: number) => useQuery({ queryKey: ['audit', 'recent', limit] as const, queryFn: () => getAudit(limit) })
export const useVerification = () => useQuery({ queryKey: ['audit', 'verify'] as const, queryFn: verifyAudit })
