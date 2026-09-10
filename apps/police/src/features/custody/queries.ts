import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createCustodyRecord, listCustodyRecords, updateCustodyRecord } from './data'
import type { CreateCustodyRecordInput } from './schema'

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custody', 'list'] })
    },
  })
}

export function useUpdateCustodyRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateCustodyRecordInput }) => updateCustodyRecord(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custody', 'list'] })
    },
  })
}
