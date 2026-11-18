import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createCustodyRecord, listCustodyRecords, updateCustodyRecord } from './data'
import type { CreateCustodyRecordInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const custodyList = { listKey: ['custody', 'list'], invalidate: [['custody', 'list'], ['cases'], ['people', 'profile']], sortBy: 'arrestedAt' } satisfies ListConfig

export const custodyRecordsOptions = (query: string) =>
  queryOptions({
    queryKey: ['custody', 'list', query] as const,
    queryFn: () => listCustodyRecords(query),
  })

export function useCustodyRecords(query: string) {
  return useSuspenseQuery(custodyRecordsOptions(query))
}

export function useCreateCustodyRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCustodyRecordInput) => createCustodyRecord(input),
    ...optimisticCreate(queryClient, custodyList),
  })
}

export function useUpdateCustodyRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateCustodyRecordInput }) => updateCustodyRecord(id, input),
    ...optimisticUpdate(queryClient, custodyList),
  })
}
