import { queryOptions, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createOrder, discardOrder, getOrder, getOrders, issueOrder, updateOrder } from './data'
import type { CreateOrderInput, UpdateOrderInput } from './schema'

export const ordersOptions = (status = '') => queryOptions({ queryKey: ['orders', status] as const, queryFn: () => getOrders(status) })
export const orderOptions = (id: string) => queryOptions({ queryKey: ['order', id] as const, queryFn: () => getOrder(id) })

export const useOrders = (status = '') => useSuspenseQuery(ordersOptions(status))
export const useOrder = (id: string) => useSuspenseQuery(orderOptions(id))

export const useCreateOrder = () => useMutation({ mutationFn: (input: CreateOrderInput) => createOrder(input) })
export const useUpdateOrder = () => useMutation({ mutationFn: (v: { id: string; input: UpdateOrderInput }) => updateOrder(v.id, v.input) })
export const useDiscardOrder = () => useMutation({ mutationFn: (id: string) => discardOrder(id) })
export const useIssueOrder = () => useMutation({ mutationFn: (id: string) => issueOrder(id) })
