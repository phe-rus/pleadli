import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createPerson, exportPersonDocument, getPersonProfile, searchPeople, updatePerson } from './data'
import type { DocumentFormat } from './data'
import type { CreatePersonInput } from './schema'

export const peopleSearchOptions = (query: string) =>
  queryOptions({
    queryKey: ['people', 'search', query] as const,
    queryFn: () => searchPeople(query),
  })

export function usePeopleSearch(query: string) {
  return useSuspenseQuery(peopleSearchOptions(query))
}

export const personProfileOptions = (id: string) =>
  queryOptions({
    queryKey: ['people', 'profile', id] as const,
    queryFn: () => getPersonProfile(id),
  })

export function usePersonProfile(id: string) {
  return useSuspenseQuery(personProfileOptions(id))
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
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['people', 'search'] })
      queryClient.invalidateQueries({ queryKey: ['people', 'profile', id] })
    },
  })
}

export function useExportPersonDocument(id: string) {
  return useMutation({ mutationFn: (format: DocumentFormat) => exportPersonDocument(id, format) })
}
