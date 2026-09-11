import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createPerson, searchPeople, updatePerson } from './data'
import type { CreatePersonInput } from './schema'

export const peopleOptions = (query: string) =>
  queryOptions({
    queryKey: ['people', 'list', query] as const,
    queryFn: () => searchPeople(query),
  })

export function usePeople(query: string) {
  return useSuspenseQuery(peopleOptions(query))
}

export const peopleSearchOptions = peopleOptions

export function useCreatePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePersonInput) => createPerson(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people', 'list'] })
    },
  })
}

export function useUpdatePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreatePersonInput }) => updatePerson(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people', 'list'] })
    },
  })
}
