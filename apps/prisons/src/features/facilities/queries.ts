import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getOwnFacility, getPeerSyncConfig, listFacilities, registerFacilitySelf, verifyFacility } from './data'
import type { RegisterFacilityInput } from './schema'

export function facilitiesOptions() {
  return { queryKey: ['facilities'] as const, queryFn: () => listFacilities() }
}

export function useFacilities(enabled = true) {
  return useQuery({ ...facilitiesOptions(), enabled })
}

export function peerSyncConfigOptions() {
  return { queryKey: ['peerSyncConfig'] as const, queryFn: () => getPeerSyncConfig() }
}

export function usePeerSyncConfig(enabled = true) {
  return useQuery({ ...peerSyncConfigOptions(), enabled })
}

export function ownFacilityOptions() {
  return { queryKey: ['facilities', 'own'] as const, queryFn: () => getOwnFacility() }
}

export function useOwnFacility(enabled = true) {
  return useQuery({ ...ownFacilityOptions(), enabled })
}

export function useRegisterFacilitySelf() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterFacilityInput) => registerFacilitySelf(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
    },
  })
}

export function useVerifyFacility() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ facilityId, code }: { facilityId: string; code: string }) => verifyFacility(facilityId, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
    },
  })
}
