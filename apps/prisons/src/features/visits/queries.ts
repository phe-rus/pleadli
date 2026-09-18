import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createVisit, listVisits, listVisitsForPrisoner } from './data'
import type { CreateVisitInput } from './schema'

export const visitsForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['visits', 'prisoner', prisonerId] as const,
    queryFn: () => listVisitsForPrisoner(prisonerId),
  })

export function useVisitsForPrisoner(prisonerId: string) {
  return useSuspenseQuery(visitsForPrisonerOptions(prisonerId))
}

export const allVisitsOptions = (query: string = '') =>
  queryOptions({
    queryKey: ['visits', 'all', query] as const,
    queryFn: () => listVisits(query),
  })

export function useVisits(query: string = '') {
  return useSuspenseQuery(allVisitsOptions(query))
}

export function useCreateVisit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateVisitInput) => createVisit(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['visits', 'prisoner', variables.prisonerId] })
      queryClient.invalidateQueries({ queryKey: ['visits', 'all'] })
    },
  })
}
