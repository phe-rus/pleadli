import { queryOptions, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createRuling, deliverRuling, discardRuling, getRuling, getRulings, updateRuling } from './data'
import type { CreateRulingInput, UpdateRulingInput } from './schema'

export const rulingsOptions = (status = '') => queryOptions({ queryKey: ['rulings', 'list', status] as const, queryFn: () => getRulings(status) })
export const rulingOptions = (id: string) => queryOptions({ queryKey: ['rulings', 'detail', id] as const, queryFn: () => getRuling(id) })

export const useRulings = (status = '') => useSuspenseQuery(rulingsOptions(status))
export const useRuling = (id: string) => useSuspenseQuery(rulingOptions(id))

export const useCreateRuling = () => useMutation({ mutationFn: (input: CreateRulingInput) => createRuling(input) })
export const useUpdateRuling = () => useMutation({ mutationFn: (v: { id: string; input: UpdateRulingInput }) => updateRuling(v.id, v.input) })
export const useDiscardRuling = () => useMutation({ mutationFn: (id: string) => discardRuling(id) })
export const useDeliverRuling = () => useMutation({ mutationFn: (v: { id: string; deliveredOn: number }) => deliverRuling(v.id, v.deliveredOn) })
