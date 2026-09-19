import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelConnection,
  connectFacility,
  createFacility,
  decideConnectionRequest,
  generatePairingCode,
  getHqNetworkStatus,
  getReachability,
  listConnectionRequests,
  listFacilityOfficers,
  lookupFacility,
  refreshConnection,
  getPeerSyncConfig,
  listFacilities,
  pairWithHeadOffice,
  pairWithHeadOfficeLater,
  resendVerificationCode,
  revokeFacility,
  syncNow,
  verifyFacility,
} from './data'
import type { ConnectFacilityInput, ConnectScope, RegisterFacilityInput } from './schema'

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

export function useCreateFacility() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RegisterFacilityInput) => createFacility(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
    },
  })
}

export function connectionRequestsOptions() {
  return { queryKey: ['connectionRequests'] as const, queryFn: () => listConnectionRequests() }
}

/** Head Office. Polls, so a facility asking to connect shows up by itself. */
export function useConnectionRequests(enabled = true) {
  return useQuery({ ...connectionRequestsOptions(), enabled, refetchInterval: 8000 })
}

export function useDecideConnectionRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => decideConnectionRequest(id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connectionRequests'] })
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      queryClient.invalidateQueries({ queryKey: ['hqNetworkStatus'] })
    },
  })
}

/** Head Office: the accounts each connected facility reports. */
export function useFacilityOfficers(enabled = true) {
  return useQuery({ queryKey: ['facilityOfficers'] as const, queryFn: () => listFacilityOfficers(), enabled })
}

export function useHqNetworkStatus(enabled = true) {
  return useQuery({ queryKey: ['hqNetworkStatus'] as const, queryFn: () => getHqNetworkStatus(), enabled, refetchInterval: 15000 })
}

export function useFacilityLookup(scope: ConnectScope) {
  return useMutation({
    mutationFn: ({ hqAddress, facilityNumber }: { hqAddress: string; facilityNumber: string }) =>
      lookupFacility(scope, hqAddress, facilityNumber),
  })
}

/** Does not invalidate the system state: the caller decides when the screen
 * should move on, so it can show a confirmation first. */
export function useConnectFacility(scope: ConnectScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ConnectFacilityInput) => connectFacility(scope, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
    },
  })
}

export function useRefreshConnection(scope: ConnectScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => refreshConnection(scope),
    onSuccess: (config) => {
      queryClient.setQueryData(['peerSyncConfig'], config)
    },
  })
}

export function useCancelConnection(scope: ConnectScope) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => cancelConnection(scope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemState'] })
      queryClient.invalidateQueries({ queryKey: ['peerSyncConfig'] })
    },
  })
}

export function useHqReachability() {
  return useMutation({ mutationFn: () => getReachability() })
}
