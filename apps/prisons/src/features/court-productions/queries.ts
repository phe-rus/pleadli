import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createCourtProduction, listCourtProductionsForPrisoner, listRemand } from './data'
import type { CreateCourtProductionInput } from './schema'

export const courtProductionsForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['court-productions', 'prisoner', prisonerId] as const,
    queryFn: () => listCourtProductionsForPrisoner(prisonerId),
  })

export function useCourtProductionsForPrisoner(prisonerId: string) {
  return useSuspenseQuery(courtProductionsForPrisonerOptions(prisonerId))
}

export const remandListOptions = () =>
  queryOptions({
    queryKey: ['court-productions', 'remand'] as const,
    queryFn: () => listRemand(),
  })

export function useRemandList() {
  return useSuspenseQuery(remandListOptions())
}

export function useCreateCourtProduction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCourtProductionInput) => createCourtProduction(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['court-productions', 'prisoner', variables.prisonerId] })
      queryClient.invalidateQueries({ queryKey: ['court-productions', 'remand'] })
    },
  })
}
