import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createVehicle, listVehicles, updateVehicle } from './data'
import type { CreateVehicleInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const vehiclesList = { listKey: ['vehicles', 'list'], invalidate: [['vehicles', 'list']], sortBy: 'createdAt' } satisfies ListConfig

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
    ...optimisticCreate(queryClient, vehiclesList),
  })
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateVehicleInput }) => updateVehicle(id, input),
    ...optimisticUpdate(queryClient, vehiclesList),
  })
}
