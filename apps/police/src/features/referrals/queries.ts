import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createReferral, listReferrals, updateReferral } from './data'
import type { CreateReferralInput } from './schema'

export const referralsOptions = (query: string) =>
  queryOptions({
    queryKey: ['referrals', 'list', query] as const,
    queryFn: () => listReferrals(query),
  })

export function useReferrals(query: string) {
  return useSuspenseQuery(referralsOptions(query))
}

export function useCreateReferral() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateReferralInput) => createReferral(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] })
    },
  })
}

export function useUpdateReferral() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateReferralInput }) => updateReferral(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] })
    },
  })
}
