import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { decideRequest, getListener, getOverview, issueActivationCode, listPendingRequests, listRoster, listStations, registerStation, revokeStation } from './data'

// The command's figures change as stations report, so they are read fresh and
// re-read every 30 seconds while the page is open.
const LIVE = 30_000

export const stationsOptions = () => queryOptions({ queryKey: ['hq', 'stations'] as const, queryFn: () => listStations(), refetchInterval: LIVE, staleTime: 5_000 })
export const overviewOptions = () => queryOptions({ queryKey: ['hq', 'overview'] as const, queryFn: () => getOverview(), refetchInterval: LIVE, staleTime: 5_000 })
export const pendingRequestsOptions = () => queryOptions({ queryKey: ['hq', 'requests'] as const, queryFn: () => listPendingRequests(), refetchInterval: LIVE, staleTime: 5_000 })

export const useStations = () => useQuery(stationsOptions())
export const useOverview = () => useQuery(overviewOptions())
export const usePendingRequests = () => useQuery(pendingRequestsOptions())
export const useRoster = (stationId: string | null) => useQuery({ queryKey: ['hq', 'roster', stationId] as const, queryFn: () => listRoster(stationId!), enabled: stationId !== null })

function useRefreshAll() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['hq'] })
}

export function useRegisterStation() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: registerStation, onSuccess: refresh })
}

export function useIssueActivationCode() {
  return useMutation({ mutationFn: issueActivationCode })
}

export function useRevokeStation() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: revokeStation, onSuccess: refresh })
}

export function useDecideRequest() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: ({ id, approve }: { id: string; approve: boolean }) => decideRequest(id, approve), onSuccess: refresh })
}

export const useListener = () => useQuery({ queryKey: ['hq', 'listener'] as const, queryFn: () => getListener() })
