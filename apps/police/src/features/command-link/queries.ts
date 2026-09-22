import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { connectToCommand, disconnectFromCommand, getLink } from './data'

/** Read every 20 seconds while the card is open, so a request approved at the
 * command shows as connected without a click. */
export const linkOptions = () => queryOptions({ queryKey: ['command-link'] as const, queryFn: () => getLink(), refetchInterval: 20_000 })

export const useLink = () => useQuery(linkOptions())

export function useConnect() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: connectToCommand, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['command-link'] }) })
}

export function useDisconnect() {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: disconnectFromCommand, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['command-link'] }) })
}
