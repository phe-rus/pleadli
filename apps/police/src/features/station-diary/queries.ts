import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createStationDiaryEntry, listStationDiaryEntries, updateStationDiaryEntry } from './data'
import type { CreateStationDiaryEntryInput } from './schema'

export const stationDiaryOptions = (query: string) =>
  queryOptions({
    queryKey: ['station-diary', 'list', query] as const,
    queryFn: () => listStationDiaryEntries(query),
  })

export function useStationDiaryEntries(query: string) {
  return useSuspenseQuery(stationDiaryOptions(query))
}

export function useCreateStationDiaryEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStationDiaryEntryInput) => createStationDiaryEntry(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station-diary', 'list'] })
    },
  })
}

export function useUpdateStationDiaryEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateStationDiaryEntryInput }) =>
      updateStationDiaryEntry(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station-diary', 'list'] })
    },
  })
}
