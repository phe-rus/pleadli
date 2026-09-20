import { queryOptions, useQuery } from '@tanstack/react-query'
import { getEstate } from './data'

export const estateOptions = () => queryOptions({ queryKey: ['estate'] as const, queryFn: () => getEstate(), refetchInterval: 60_000 })

/** Refreshed every minute while the page is open: a facility's silence is
 * the thing this view exists to show, so it should not go stale on screen. */
export function useEstate(enabled = true) {
  return useQuery({ ...estateOptions(), enabled })
}
