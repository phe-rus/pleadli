import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCloudflareConfig, provisionCloudflareTunnel, saveCloudflareConfig } from './data'
import type { SaveCloudflareConfigInput } from './schema'

export function cloudflareConfigOptions() {
  return { queryKey: ['cloudflareConfig'] as const, queryFn: () => getCloudflareConfig() }
}

export function useCloudflareConfig(enabled = true) {
  return useQuery({ ...cloudflareConfigOptions(), enabled })
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

export function useProvisionCloudflareTunnel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => provisionCloudflareTunnel(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hqNetworkStatus'] })
    },
  })
}
