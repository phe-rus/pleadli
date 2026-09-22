import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { getToday } from './data'

export const overviewOptions = () => queryOptions({ queryKey: ['overview'] as const, queryFn: () => getToday() })
export const useOverview = () => useSuspenseQuery(overviewOptions())
/** For the sidebar and status bar, which must not suspend the page. */
export const useOverviewSoft = () => useQuery(overviewOptions())
