import { queryOptions, useQuery } from '@tanstack/react-query'
import { listRecentActivity } from './data'

export const recentActivityOptions = () =>
  queryOptions({
    queryKey: ['activity', 'recent'] as const,
    queryFn: () => listRecentActivity(),
  })

/** Plain `useQuery`, not suspense: this keeps quietly polling for new
 * activity in the background (see activity-toasts.tsx) and must never
 * suspend the app shell it's mounted alongside — same reasoning already
 * applied to `useActiveBackupAlerts`. */
export function useRecentActivity() {
  return useQuery({ ...recentActivityOptions(), refetchInterval: 15_000 })
}
