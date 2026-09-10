import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createIncident, listIncidents, updateIncident } from './data'
import type { CreateIncidentInput } from './schema'

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents', 'list'] })
    },
  })
}

export function useUpdateIncident() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateIncidentInput }) => updateIncident(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents', 'list'] })
    },
  })
}
