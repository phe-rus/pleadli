import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createCharge, listChargesForFile } from './data'
import type { CreateChargeInput } from './schema'

export const chargesForFileOptions = (prosecutionFileId: string) =>
  queryOptions({
    queryKey: ['charges', 'file', prosecutionFileId] as const,
    queryFn: () => listChargesForFile(prosecutionFileId),
  })

export function useChargesForFile(prosecutionFileId: string) {
  return useSuspenseQuery(chargesForFileOptions(prosecutionFileId))
}

export function useCreateCharge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateChargeInput) => createCharge(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['charges', 'file', variables.prosecutionFileId] })
    },
  })
}
