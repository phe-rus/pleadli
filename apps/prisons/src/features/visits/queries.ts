import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createVisit, listVisitsForPrisoner } from './data'
import type { CreateVisitInput } from './schema'

export const visitsForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['visits', 'prisoner', prisonerId] as const,
    queryFn: () => listVisitsForPrisoner(prisonerId),
  })

export function useVisitsForPrisoner(prisonerId: string) {
  return useSuspenseQuery(visitsForPrisonerOptions(prisonerId))
}

export function useCreateVisit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateVisitInput) => createVisit(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['visits', 'prisoner', variables.prisonerId] })
    },
  })
}
