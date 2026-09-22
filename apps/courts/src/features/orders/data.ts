import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { orderSchema, orderSummarySchema, type CreateOrderInput, type UpdateOrderInput } from './schema'

export async function getOrders(status = '') {
  return z.array(orderSummarySchema).parse(await api('GET', '/api/orders', { query: { status } }))
}

export async function getOrder(id: string) {
  return orderSchema.nullable().parse(await api('GET', `/api/orders/${seg(id)}`))
}

export async function createOrder(input: CreateOrderInput) {
  return orderSchema.parse(await api('POST', '/api/orders', { body: input }))
}

export async function updateOrder(id: string, input: UpdateOrderInput) {
  return orderSchema.parse(await api('PUT', `/api/orders/${seg(id)}`, { body: input }))
}

export async function discardOrder(id: string) {
  await api('DELETE', `/api/orders/${seg(id)}`)
}

export async function issueOrder(id: string) {
  return orderSchema.parse(await api('POST', `/api/orders/${seg(id)}/issue`))
}
