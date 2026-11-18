import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createReferral, listReferrals, updateReferral } from './data'
import type { CreateReferralInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const referralsList = { listKey: ['referrals', 'list'], invalidate: [['referrals']], sortBy: 'referredAt' } satisfies ListConfig

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
    ...optimisticCreate(queryClient, referralsList),
  })
}

export function useUpdateReferral() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateReferralInput }) => updateReferral(id, input),
    ...optimisticUpdate(queryClient, referralsList),
  })
}
