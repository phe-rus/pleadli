import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createPerson, searchPeople, updatePerson } from './data'
import type { CreatePersonInput } from './schema'

export const peopleSearchOptions = (query: string) =>
  queryOptions({
    queryKey: ['people', 'search', query] as const,
    queryFn: () => searchPeople(query),
  })

export function usePeopleSearch(query: string) {
  return useSuspenseQuery(peopleSearchOptions(query))
}

export function useCreatePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePersonInput) => createPerson(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people', 'search'] })
    },
  })
}

export function useUpdatePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreatePersonInput }) => updatePerson(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people', 'search'] })
    },
  })
}
