import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createRequest, listRequests, listRequestsForPrisoner, resolveRequest } from './data'
import type { CreateRequestInput, ResolveRequestInput } from './schema'

export const requestsOptions = () =>
  queryOptions({
    queryKey: ['requests', 'all'] as const,
    queryFn: () => listRequests(),
  })

export function useRequests() {
  return useSuspenseQuery(requestsOptions())
}

export const requestsForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['requests', 'prisoner', prisonerId] as const,
    queryFn: () => listRequestsForPrisoner(prisonerId),
  })

export function useRequestsForPrisoner(prisonerId: string) {
  return useSuspenseQuery(requestsForPrisonerOptions(prisonerId))
}

function invalidateRequestQueries(queryClient: ReturnType<typeof useQueryClient>, prisonerId?: string | null) {
  queryClient.invalidateQueries({ queryKey: ['requests', 'all'] })
  if (prisonerId) queryClient.invalidateQueries({ queryKey: ['requests', 'prisoner', prisonerId] })
}

export function useCreateRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateRequestInput) => createRequest(input),
    onSuccess: (_, variables) => invalidateRequestQueries(queryClient, variables.prisonerId),
  })
}

export function useResolveRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResolveRequestInput }) => resolveRequest(id, input),
    onSuccess: (result) => invalidateRequestQueries(queryClient, result.prisonerId),
  })
}
