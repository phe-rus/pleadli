import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createStationAsset, listStationAssets, updateStationAsset } from './data'
import type { CreateStationAssetInput } from './schema'
import { optimisticCreate, optimisticUpdate, type ListConfig } from '@/lib/optimistic'

const station_assetsList = { listKey: ['station-assets', 'list'], invalidate: [['station-assets', 'list']], sortBy: 'createdAt' } satisfies ListConfig

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
    ...optimisticCreate(queryClient, station_assetsList),
  })
}

export function useUpdateStationAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateStationAssetInput }) =>
      updateStationAsset(id, input),
    ...optimisticUpdate(queryClient, station_assetsList),
  })
}
