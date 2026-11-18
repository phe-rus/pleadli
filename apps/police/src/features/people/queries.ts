import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createPerson, exportPersonDocument, getPersonProfile, searchPeople, updatePerson } from './data'
import type { DocumentFormat } from './data'
import type { CreatePersonInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const peopleList = { listKey: ['people', 'search'], invalidate: [['people']], sortBy: 'createdAt' } satisfies ListConfig

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
    ...optimisticCreate(queryClient, peopleList),
  })
}

export function useUpdatePerson() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreatePersonInput }) => updatePerson(id, input),
    ...optimisticUpdate(queryClient, peopleList),
  })
}

export function useExportPersonDocument(id: string) {
  return useMutation({ mutationFn: (format: DocumentFormat) => exportPersonDocument(id, format) })
}
