import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createIncident, listIncidents, updateIncident } from './data'
import type { CreateIncidentInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const incidentsList = { listKey: ['incidents', 'list'], invalidate: [['incidents', 'list']], sortBy: 'occurredAt' } satisfies ListConfig

export const incidentsOptions = (query: string) =>
  queryOptions({
    queryKey: ['incidents', 'list', query] as const,
    queryFn: () => listIncidents(query),
  })

export function useIncidents(query: string) {
  return useSuspenseQuery(incidentsOptions(query))
}

export function useCreateIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateIncidentInput) => createIncident(input),
    ...optimisticCreate(queryClient, incidentsList),
  })
}

export function useUpdateIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateIncidentInput }) => updateIncident(id, input),
    ...optimisticUpdate(queryClient, incidentsList),
  })
}
