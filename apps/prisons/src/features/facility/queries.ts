import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { getFacilityProfile, saveFacilityProfile } from './data'
import type { SaveFacilityProfileInput } from './schema'

export const facilityProfileOptions = () =>
  queryOptions({
    queryKey: ['facility', 'profile'] as const,
    queryFn: () => getFacilityProfile(),
  })

export function useFacilityProfile() {
  return useSuspenseQuery(facilityProfileOptions())
}

export function useSaveFacilityProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveFacilityProfileInput) => saveFacilityProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility'] })
      queryClient.invalidateQueries({ queryKey: ['today'] })
    },
  })
}
