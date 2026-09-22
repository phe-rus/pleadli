import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import { getProfile, saveProfile } from './data'
import type { SaveProfileInput } from './schema'

export const profileOptions = () => queryOptions({ queryKey: ['profile'] as const, queryFn: () => getProfile() })
export const useProfile = () => useQuery(profileOptions())
export const useSaveProfile = () => useMutation({ mutationFn: (input: SaveProfileInput) => saveProfile(input) })
