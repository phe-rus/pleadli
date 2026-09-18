import { api } from '@/lib/api'
import { resolveObligationSchema, todayViewSchema, type ResolveObligationInput } from './schema'

export async function getToday() {
  return todayViewSchema.parse(await api('GET', '/api/prisons/today'))
}

export async function resolveObligation(input: ResolveObligationInput) {
  const body = resolveObligationSchema.parse(input)
  await api('POST', '/api/prisons/obligations/resolve', { body })
}
