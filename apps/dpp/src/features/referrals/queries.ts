import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createResubmission, listReferralsForFile } from './data'
import type { CreateResubmissionInput } from './schema'

export const referralsForFileOptions = (prosecutionFileId: string) =>
  queryOptions({
    queryKey: ['referrals', 'file', prosecutionFileId] as const,
    queryFn: () => listReferralsForFile(prosecutionFileId),
  })

export function useReferralsForFile(prosecutionFileId: string) {
  return useSuspenseQuery(referralsForFileOptions(prosecutionFileId))
}

export function useCreateResubmission() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateResubmissionInput) => createResubmission(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['referrals', 'file', variables.prosecutionFileId] })
      queryClient.invalidateQueries({ queryKey: ['prosecution-files'] })
    },
  })
}
