import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  getCloudflareConfig,
  getCloudflareTunnelState,
  getLocalNetworkInfo,
  getLocalPairingQr,
  getRemoteAccessStatus,
  saveCloudflareConfig,
  setRemoteAccessEnabled,
} from './data'
import type { SaveCloudflareConfigInput } from './schema'

export const remoteAccessStatusOptions = () =>
  queryOptions({
    queryKey: ['remoteAccessStatus'] as const,
    queryFn: () => getRemoteAccessStatus(),
  })

export function useRemoteAccessStatus() {
  return useSuspenseQuery(remoteAccessStatusOptions())
}

export function useSetRemoteAccessEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => setRemoteAccessEnabled(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remoteAccessStatus'] })
      queryClient.invalidateQueries({ queryKey: ['cloudflareTunnelState'] })
    },
  })
}

export const localNetworkInfoOptions = () =>
  queryOptions({
    queryKey: ['localNetworkInfo'] as const,
    queryFn: () => getLocalNetworkInfo(),
  })

export function useLocalNetworkInfo() {
  return useSuspenseQuery(localNetworkInfoOptions())
}

export function useLocalPairingQr(enabled: boolean) {
  return useQuery({
    queryKey: ['localPairingQr'] as const,
    queryFn: () => getLocalPairingQr(),
    enabled,
  })
}

export const cloudflareConfigOptions = () =>
  queryOptions({
    queryKey: ['cloudflareConfig'] as const,
    queryFn: () => getCloudflareConfig(),
  })

export function useCloudflareConfig() {
  return useSuspenseQuery(cloudflareConfigOptions())
}

export function useSaveCloudflareConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveCloudflareConfigInput) => saveCloudflareConfig(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudflareConfig'] })
    },
  })
}

export function useCloudflareTunnelState() {
  return useQuery({
    queryKey: ['cloudflareTunnelState'] as const,
    queryFn: () => getCloudflareTunnelState(),
  })
}
