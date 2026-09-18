import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createOfficer,
  createOfficerTrusted,
  getOfficerByBadge,
  isBootstrap,
  listOfficers,
  listOfficersTrusted,
  login,
  updateOfficer,
  updateOfficerTrusted,
} from './data'
import type { CreateOfficerInput, CreateOfficerTrustedInput, UpdateOfficerInput, UpdateOfficerTrustedInput } from './schema'

export function useIsBootstrap() {
  return useQuery({ queryKey: ['officers', 'isBootstrap'] as const, queryFn: () => isBootstrap() })
}

/** Only fetches once real admin credentials are supplied — there is no
 * ambient session to key off, so this stays disabled until the caller
 * has something to authenticate with. */
export function useOfficers(adminBadgeNumber: string, adminPassword: string, enabled: boolean) {
  return useQuery({
    queryKey: ['officers', 'list', adminBadgeNumber] as const,
    queryFn: () => listOfficers(adminBadgeNumber, adminPassword),
    enabled,
    retry: false,
  })
}

export function useCreateOfficer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOfficerInput) => createOfficer(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
    },
  })
}

export function useUpdateOfficer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOfficerInput }) => updateOfficer(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
    },
  })
}

/** Head Office's own version of `useOfficers`: enabled purely on there
 * being an active HQ session (checked server side on every call), not on
 * the caller having admin credentials to hand — there are none here. */
export function useOfficersTrusted(enabled: boolean) {
  return useQuery({ queryKey: ['officers', 'listTrusted'] as const, queryFn: () => listOfficersTrusted(), enabled })
}

export function useCreateOfficerTrusted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateOfficerTrustedInput) => createOfficerTrusted(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
    },
  })
}

export function useUpdateOfficerTrusted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOfficerTrustedInput }) => updateOfficerTrusted(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officers'] })
    },
  })
}

export function useOfficerByBadge() {
  return useMutation({ mutationFn: (badgeNumber: string) => getOfficerByBadge(badgeNumber) })
}

export function useLogin() {
  return useMutation({ mutationFn: ({ badgeNumber, password }: { badgeNumber: string; password: string }) => login(badgeNumber, password) })
}
