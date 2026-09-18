import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createHealthEvent, listHealthEventsForPrisoner, listHospitalised } from './data'
import type { CreateHealthEventInput } from './schema'

export const healthEventsForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['health-events', 'prisoner', prisonerId] as const,
    queryFn: () => listHealthEventsForPrisoner(prisonerId),
  })

export function useHealthEventsForPrisoner(prisonerId: string) {
  return useSuspenseQuery(healthEventsForPrisonerOptions(prisonerId))
}

export const hospitalisedOptions = () =>
  queryOptions({
    queryKey: ['health-events', 'hospitalised'] as const,
    queryFn: () => listHospitalised(),
  })

export function useHospitalised() {
  return useSuspenseQuery(hospitalisedOptions())
}

export function useCreateHealthEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateHealthEventInput) => createHealthEvent(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['health-events', 'prisoner', variables.prisonerId] })
      queryClient.invalidateQueries({ queryKey: ['health-events', 'hospitalised'] })
    },
  })
}
