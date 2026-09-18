import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { getReportsSummary } from './data'

export const reportsSummaryOptions = () =>
  queryOptions({
    queryKey: ['reports', 'summary'] as const,
    queryFn: () => getReportsSummary(),
  })

export function useReportsSummary() {
  return useSuspenseQuery(reportsSummaryOptions())
}
