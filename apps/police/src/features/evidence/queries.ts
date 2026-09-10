import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  createExhibit,
  createExhibitMovement,
  listExhibitMovements,
  listExhibits,
  updateExhibit,
} from './data'
import type { CreateExhibitInput, CreateExhibitMovementInput } from './schema'

export const exhibitsOptions = (query: string) =>
  queryOptions({
    queryKey: ['exhibits', 'list', query] as const,
    queryFn: () => listExhibits(query),
  })

export function useExhibits(query: string) {
  return useSuspenseQuery(exhibitsOptions(query))
}

export const exhibitMovementsOptions = (exhibitId: string) =>
  queryOptions({
    queryKey: ['exhibits', 'movements', exhibitId] as const,
    queryFn: () => listExhibitMovements(exhibitId),
    enabled: Boolean(exhibitId),
  })

export function useExhibitMovements(exhibitId: string) {
  return useQuery(exhibitMovementsOptions(exhibitId))
}

export function useCreateExhibit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateExhibitInput) => createExhibit(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibits'] })
    },
  })
}

export function useUpdateExhibit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateExhibitInput }) => updateExhibit(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibits'] })
    },
  })
}

export function useCreateExhibitMovement(exhibitId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateExhibitMovementInput) => createExhibitMovement(exhibitId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exhibits', 'movements', exhibitId] })
    },
  })
}
