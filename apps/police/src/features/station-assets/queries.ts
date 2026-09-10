import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createStationAsset, listStationAssets, updateStationAsset } from './data'
import type { CreateStationAssetInput } from './schema'

export const stationAssetsOptions = (query: string) =>
  queryOptions({
    queryKey: ['station-assets', 'list', query] as const,
    queryFn: () => listStationAssets(query),
  })

export function useStationAssets(query: string) {
  return useSuspenseQuery(stationAssetsOptions(query))
}

export function useCreateStationAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateStationAssetInput) => createStationAsset(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station-assets', 'list'] })
    },
  })
}

export function useUpdateStationAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateStationAssetInput }) =>
      updateStationAsset(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station-assets', 'list'] })
    },
  })
}
