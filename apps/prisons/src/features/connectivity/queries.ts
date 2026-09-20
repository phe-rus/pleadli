import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { disconnectFromHeadOffice, getConnectivityStatus, setSyncClass } from './data'

export const connectivityStatusOptions = () => ({
  queryKey: ['connectivity'] as const,
  queryFn: () => getConnectivityStatus(),
  retry: false,
})

/** The one status of the Head Office connection. Asked again every 30 seconds
 * while the window is in front, and not at all while it is not: a background
 * window costs the node nothing. */
export function useConnectivityStatus(enabled = true) {
  return useQuery({ ...connectivityStatusOptions(), enabled, refetchInterval: 30_000, refetchIntervalInBackground: false })
}

function useInvalidateConnection() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['connectivity'] })
    queryClient.invalidateQueries({ queryKey: ['systemState'] })
    queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
    queryClient.invalidateQueries({ queryKey: ['inbox'] })
  }
}

export function useDisconnectFromHeadOffice() {
  const invalidate = useInvalidateConnection()
  return useMutation({ mutationFn: disconnectFromHeadOffice, onSuccess: invalidate })
}

export function useSetSyncClass() {
  const invalidate = useInvalidateConnection()
  return useMutation({ mutationFn: setSyncClass, onSuccess: invalidate })
}
