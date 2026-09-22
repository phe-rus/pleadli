import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { getChain, saveChain } from './data'
import type { SaveChainInput } from './schema'

export const chainOptions = () =>
  queryOptions({
    queryKey: ['units', 'chain'] as const,
    queryFn: () => getChain(),
  })

export function useChain() {
  return useSuspenseQuery(chainOptions())
}

export function useSaveChain() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveChainInput) => saveChain(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
    },
  })
}
