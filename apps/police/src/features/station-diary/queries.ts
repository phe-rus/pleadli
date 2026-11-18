import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { optimisticList, pendingId } from '@/lib/optimistic'
import { createStationDiaryEntry, listStationDiaryEntries, updateStationDiaryEntry } from './data'
import type { CreateStationDiaryEntryInput, StationDiaryEntry } from './schema'

const listKey = ['station-diary', 'list'] as const

export const stationDiaryOptions = (query: string) =>
  queryOptions({
    queryKey: [...listKey, query] as const,
    queryFn: () => listStationDiaryEntries(query),
  })

export function useStationDiaryEntries(query: string) {
  return useSuspenseQuery(stationDiaryOptions(query))
}

/** The unfiltered diary is the one an officer is looking at while they log an entry, so the
 * new line is placed at the top at once; searches are left alone and simply refetch. */
const isUnfiltered = (key: readonly unknown[]) => key[2] === ''

export function useCreateStationDiaryEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStationDiaryEntryInput) => createStationDiaryEntry(input),
    onMutate: (input) =>
      optimisticList<StationDiaryEntry>(
        queryClient,
        listKey,
        (entries) => [
          {
            id: pendingId(),
            category: input.category,
            content: input.content,
            personId: input.personId,
            personFirstName: null,
            personLastName: null,
            personOtherNames: null,
            entryYear: null,
            entryNumber: null,
            createdAt: Date.now(),
          },
          ...entries,
        ],
        isUnfiltered,
      ),
    onError: (_error, _input, rollback) => rollback?.(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  })
}

export function useUpdateStationDiaryEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateStationDiaryEntryInput }) =>
      updateStationDiaryEntry(id, input),
    onMutate: ({ id, input }) =>
      optimisticList<StationDiaryEntry>(queryClient, listKey, (entries) =>
        entries.map((entry) =>
          entry.id === id ? { ...entry, category: input.category, content: input.content, personId: input.personId } : entry,
        ),
      ),
    onError: (_error, _vars, rollback) => rollback?.(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  })
}
