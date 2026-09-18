import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { cancelCourtProduction, createCourtProduction, listCourtProductionsForPrisoner, listRemand, recordCourtOutcome } from './data'
import type { CreateCourtProductionInput, RecordCourtOutcomeInput } from './schema'

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
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['legal'] })
    },
  })
}

function invalidateAfterCourtChange(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['court-productions'] })
  queryClient.invalidateQueries({ queryKey: ['today'] })
  queryClient.invalidateQueries({ queryKey: ['legal'] })
  queryClient.invalidateQueries({ queryKey: ['custody'] })
  queryClient.invalidateQueries({ queryKey: ['prisoners'] })
}

export function useRecordCourtOutcome() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordCourtOutcomeInput) => recordCourtOutcome(input),
    onSuccess: () => invalidateAfterCourtChange(queryClient),
  })
}

export function useCancelCourtProduction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ productionId, reason }: { productionId: string; reason: string }) => cancelCourtProduction(productionId, reason),
    onSuccess: () => invalidateAfterCourtChange(queryClient),
  })
}
