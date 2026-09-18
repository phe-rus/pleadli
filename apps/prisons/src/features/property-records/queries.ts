import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createPropertyRecord, listPropertyRecordsForPrisoner, returnPropertyRecord } from './data'
import type { CreatePropertyRecordInput, ReturnPropertyRecordInput } from './schema'

export const propertyRecordsForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['property-records', 'prisoner', prisonerId] as const,
    queryFn: () => listPropertyRecordsForPrisoner(prisonerId),
  })

export function usePropertyRecordsForPrisoner(prisonerId: string) {
  return useSuspenseQuery(propertyRecordsForPrisonerOptions(prisonerId))
}

export function useCreatePropertyRecord() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePropertyRecordInput) => createPropertyRecord(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['property-records', 'prisoner', variables.prisonerId] })
    },
  })
}

export function useReturnPropertyRecord(prisonerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReturnPropertyRecordInput }) => returnPropertyRecord(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-records', 'prisoner', prisonerId] })
    },
  })
}
