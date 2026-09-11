import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { checkInByBadge, createShiftHandover, listCheckIns, listShiftHandovers } from './data'
import type { CreateShiftHandoverInput } from './schema'

export const checkInsOptions = (query: string) =>
  queryOptions({
    queryKey: ['check-ins', 'list', query] as const,
    queryFn: () => listCheckIns(query),
  })

export function useCheckIns(query: string) {
  return useSuspenseQuery(checkInsOptions(query))
}

export function useCheckInByBadge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (badgeNumber: string) => checkInByBadge(badgeNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['check-ins', 'list'] })
    },
  })
}

export const shiftHandoversOptions = (query: string) =>
  queryOptions({
    queryKey: ['shift-handovers', 'list', query] as const,
    queryFn: () => listShiftHandovers(query),
  })

export function useShiftHandovers(query: string) {
  return useSuspenseQuery(shiftHandoversOptions(query))
}

export function useCreateShiftHandover() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateShiftHandoverInput) => createShiftHandover(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-handovers', 'list'] })
    },
  })
}
