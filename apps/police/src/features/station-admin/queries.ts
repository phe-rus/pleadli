import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  createEstablishmentMember,
  getStationProfile,
  listEstablishment,
  saveStationProfile,
  updateEstablishmentMember,
} from './data'
import type { CreateStationEstablishmentMemberInput, SaveStationProfileInput } from './schema'

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

export const establishmentOptions = (query: string) =>
  queryOptions({
    queryKey: ['stationEstablishment', 'list', query] as const,
    queryFn: () => listEstablishment(query),
  })

export function useEstablishment(query: string) {
  return useSuspenseQuery(establishmentOptions(query))
}

export function useCreateEstablishmentMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStationEstablishmentMemberInput) => createEstablishmentMember(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stationEstablishment'] })
    },
  })
}

export function useUpdateEstablishmentMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateStationEstablishmentMemberInput }) =>
      updateEstablishmentMember(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stationEstablishment'] })
    },
  })
}
