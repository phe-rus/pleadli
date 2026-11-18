import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createBond, listBonds, updateBond } from './data'
import type { CreateBondInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const bondsList = { listKey: ['bonds', 'list'], invalidate: [['bonds', 'list'], ['custody'], ['people', 'profile'], ['cases']], sortBy: 'grantedAt' } satisfies ListConfig

export const bondsOptions = (query: string) =>
  queryOptions({
    queryKey: ['bonds', 'list', query] as const,
    queryFn: () => listBonds(query),
  })

export function useBonds(query: string) {
  return useSuspenseQuery(bondsOptions(query))
}

export function useCreateBond() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBondInput) => createBond(input),
    ...optimisticCreate(queryClient, bondsList),
  })
}

export function useUpdateBond() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateBondInput }) => updateBond(id, input),
    ...optimisticUpdate(queryClient, bondsList),
  })
}
