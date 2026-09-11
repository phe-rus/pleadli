import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createVehicle, listVehicles, updateVehicle } from './data'
import type { CreateVehicleInput } from './schema'

export const vehiclesOptions = (query: string) =>
  queryOptions({
    queryKey: ['vehicles', 'list', query] as const,
    queryFn: () => listVehicles(query),
  })

export function useVehicles(query: string) {
  return useSuspenseQuery(vehiclesOptions(query))
}

export function useCreateVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateVehicleInput) => createVehicle(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles', 'list'] })
    },
  })
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateVehicleInput }) => updateVehicle(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles', 'list'] })
    },
  })
}
