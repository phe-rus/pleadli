import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createTransfer, listTransfersForPrisoner } from './data'
import type { CreateTransferInput } from './schema'

export const transfersForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['transfers', 'prisoner', prisonerId] as const,
    queryFn: () => listTransfersForPrisoner(prisonerId),
  })

export function useTransfersForPrisoner(prisonerId: string) {
  return useSuspenseQuery(transfersForPrisonerOptions(prisonerId))
}

export function useCreateTransfer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTransferInput) => createTransfer(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transfers', 'prisoner', variables.prisonerId] })
      queryClient.invalidateQueries({ queryKey: ['prisoners'] })
    },
  })
}
