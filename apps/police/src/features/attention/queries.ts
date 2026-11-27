import { queryOptions, useQuery } from '@tanstack/react-query'
import { useInstallation } from '@/features/session'
import { getAttention, type CaseStanding } from './data'

/** Kept fresh: the clock moves custody toward its limit even when no record changes. */
export const attentionOptions = (enabled = true) =>
  queryOptions({ queryKey: ['attention'] as const, queryFn: getAttention, enabled, refetchInterval: 60_000, staleTime: 15_000 })

/** The station's attention, or undefined on a Command (which holds none of these records) and while loading. */
export function useAttention() {
  const { data: installation } = useInstallation()
  return useQuery(attentionOptions(installation?.mode === 'station'))
}

export const standingOf = (attention: { cases: CaseStanding[] } | undefined, caseId: string) => attention?.cases.find((c) => c.caseId === caseId)
