import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { getToday, resolveObligation } from './data'
import type { ResolveObligationInput } from './schema'

export const todayOptions = () =>
  queryOptions({
    queryKey: ['today'] as const,
    queryFn: () => getToday(),
    refetchInterval: 60_000,
  })

export function useToday() {
  return useSuspenseQuery(todayOptions())
}

export function useResolveObligation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ResolveObligationInput) => resolveObligation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['custody'] })
    },
  })
}
