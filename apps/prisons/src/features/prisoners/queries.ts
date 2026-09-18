import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { getPrisoner, listInCustody, listPrisoners, updatePrisoner } from './data'
import type { UpdatePrisonerInput } from './schema'

export const prisonersOptions = (query: string) =>
  queryOptions({
    queryKey: ['prisoners', 'list', query] as const,
    queryFn: () => listPrisoners(query),
  })

export function usePrisoners(query: string) {
  return useSuspenseQuery(prisonersOptions(query))
}

export const inCustodyOptions = () =>
  queryOptions({
    queryKey: ['prisoners', 'in-custody'] as const,
    queryFn: () => listInCustody(),
  })

export function useInCustody() {
  return useSuspenseQuery(inCustodyOptions())
}

export const prisonerOptions = (id: string) =>
  queryOptions({
    queryKey: ['prisoners', 'detail', id] as const,
    queryFn: () => getPrisoner(id),
  })

export function usePrisoner(id: string) {
  return useSuspenseQuery(prisonerOptions(id))
}

function invalidatePrisonerQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['prisoners'] })
}

export function useUpdatePrisoner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePrisonerInput }) => updatePrisoner(id, input),
    onSuccess: () => invalidatePrisonerQueries(queryClient),
  })
}
