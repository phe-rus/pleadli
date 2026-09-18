import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getProsecutorProfile, saveProsecutorProfile } from './data'
import type { SaveProsecutorProfileInput } from './schema'

export const prosecutorProfileOptions = () =>
  queryOptions({
    queryKey: ['prosecutorProfile'] as const,
    queryFn: () => getProsecutorProfile(),
  })

export function useProsecutorProfile() {
  return useQuery(prosecutorProfileOptions())
}

export function useSaveProsecutorProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveProsecutorProfileInput) => saveProsecutorProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prosecutorProfile'] })
    },
  })
}
