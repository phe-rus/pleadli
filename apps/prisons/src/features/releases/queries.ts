import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createRelease, listReleasesForPrisoner } from './data'
import type { CreateReleaseInput } from './schema'

export const releasesForPrisonerOptions = (prisonerId: string) =>
  queryOptions({
    queryKey: ['releases', 'prisoner', prisonerId] as const,
    queryFn: () => listReleasesForPrisoner(prisonerId),
  })

export function useReleasesForPrisoner(prisonerId: string) {
  return useSuspenseQuery(releasesForPrisonerOptions(prisonerId))
}

export function useCreateRelease() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateReleaseInput) => createRelease(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['releases', 'prisoner', variables.prisonerId] })
      queryClient.invalidateQueries({ queryKey: ['prisoners'] })
    },
  })
}
