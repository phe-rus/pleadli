import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  generatePairingCode,
  getPeerSyncConfig,
  listFacilities,
  pairWithHeadOffice,
  pairWithHeadOfficeLater,
  resendVerificationCode,
  revokeFacility,
  syncNow,
  verifyFacility,
} from './data'
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

export function useVerifyFacility() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ facilityId, code }: { facilityId: string; code: string }) => verifyFacility(facilityId, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
    },
  })
}

export function useGeneratePairingCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (officerEmail: string) => generatePairingCode(officerEmail),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
    },
  })
}

export function useResendVerificationCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (facilityId: string) => resendVerificationCode(facilityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
    },
  })
}

export function useRevokeFacility() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (facilityId: string) => revokeFacility(facilityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
    },
  })
}

/** The whole first-launch pairing, done by the node: it presents the secret
 * to Head Office and stores whatever credentials it assigns. */
export function usePairWithHeadOffice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ pairingCode, input }: { pairingCode: string; input: RegisterFacilityInput }) =>
      pairWithHeadOffice(pairingCode, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemState'] })
      queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
    },
  })
}

export function usePairWithHeadOfficeLater() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ pairingCode, input }: { pairingCode: string; input: RegisterFacilityInput }) =>
      pairWithHeadOfficeLater(pairingCode, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemState'] })
      queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
    },
  })
}

export function useSyncNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => syncNow(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
    },
  })
}
