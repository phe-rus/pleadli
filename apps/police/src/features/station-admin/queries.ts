import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { getStationProfile, saveStationProfile } from './data'
import type { SaveStationProfileInput } from './schema'

export const stationProfileOptions = () =>
  queryOptions({
    queryKey: ['stationProfile'] as const,
    queryFn: () => getStationProfile(),
  })

export function useStationProfile() {
  return useSuspenseQuery(stationProfileOptions())
}

export function useSaveStationProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveStationProfileInput) => saveStationProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stationProfile'] })
    },
  })
}
