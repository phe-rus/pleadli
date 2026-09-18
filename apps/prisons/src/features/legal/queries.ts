import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { getLegalOverview } from './data'

export const legalOverviewOptions = () =>
  queryOptions({
    queryKey: ['legal', 'overview'] as const,
    queryFn: () => getLegalOverview(),
  })

export function useLegalOverview() {
  return useSuspenseQuery(legalOverviewOptions())
}
