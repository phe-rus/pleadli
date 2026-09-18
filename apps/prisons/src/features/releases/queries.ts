import { queryOptions, useMutation, useQueryClient, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createRelease, getDischargeCheck, listReleasesForPrisoner } from './data'
import type { CreateReleaseInput } from './schema'

export const releasesForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['releases', 'prisoner', prisonerId] as const,
    queryFn: () => listReleasesForPrisoner(prisonerId),
  })

export function useReleasesForPrisoner(prisonerId: string) {
  return useSuspenseQuery(releasesForPrisonerOptions(prisonerId))
}

export const dischargeCheckOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['releases', 'discharge-check', prisonerId] as const,
    queryFn: () => getDischargeCheck(prisonerId),
  })

export function useDischargeCheck(prisonerId: string) {
  return useQuery(dischargeCheckOptions(prisonerId))
}

export function useCreateRelease() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateReleaseInput) => createRelease(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['releases'] })
      queryClient.invalidateQueries({ queryKey: ['prisoners'] })
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['property-records', 'prisoner', variables.prisonerId] })
    },
  })
}
