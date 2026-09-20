import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getInboxItem, getUnreadCount, listInbox, markInboxRead, recordCommunication, setInboxStatus } from './data'

export const inboxOptions = () => ({ queryKey: ['inbox', 'list'] as const, queryFn: () => listInbox() })

export function useInbox() {
  return useQuery({ ...inboxOptions(), refetchInterval: 60_000, refetchIntervalInBackground: false })
}

/** How many items still need attention and have not been opened by this
 * officer. Polled once a minute while the window is in front: one small query
 * on the node, none while the window is behind. */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: ['inbox', 'unread'] as const,
    queryFn: () => getUnreadCount(),
    enabled,
    retry: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

export function useInboxItem(id: string | null) {
  return useQuery({ queryKey: ['inbox', 'item', id] as const, queryFn: () => getInboxItem(id!), enabled: id != null })
}

function useRefreshInbox() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['inbox'] })
}

export function useMarkRead() {
  const refresh = useRefreshInbox()
  return useMutation({ mutationFn: markInboxRead, onSuccess: refresh })
}

export function useSetInboxStatus() {
  const refresh = useRefreshInbox()
  return useMutation({ mutationFn: setInboxStatus, onSuccess: refresh })
}

export function useRecordCommunication() {
  const refresh = useRefreshInbox()
  return useMutation({ mutationFn: recordCommunication, onSuccess: refresh })
}
