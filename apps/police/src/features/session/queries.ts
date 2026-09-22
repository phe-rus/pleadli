import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { getAuthPolicy, getInstallation, getMe, listAuthEvents, saveAuthPolicy } from './data'

export const installationOptions = () =>
  queryOptions({
    queryKey: ['system', 'installation'] as const,
    queryFn: () => getInstallation(),
    retry: false,
  })

export function useInstallation() {
  return useQuery(installationOptions())
}

/** For the pages of an installed application, where the state is known. */
export function useInstalledMode() {
  const { data } = useSuspenseQuery(installationOptions())
  return data
}

/** Checked every minute, so an idle sign-in that the app has ended is noticed
 * without waiting for the next click. */
export const meOptions = () =>
  queryOptions({
    queryKey: ['auth', 'me'] as const,
    queryFn: () => getMe(),
    retry: false,
    refetchInterval: 60_000,
  })

export function useMe() {
  return useQuery(meOptions())
}

export const authPolicyOptions = () => queryOptions({ queryKey: ['auth', 'policy'] as const, queryFn: () => getAuthPolicy() })

export function useAuthPolicy() {
  return useQuery(authPolicyOptions())
}

export function useSaveAuthPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveAuthPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      queryClient.invalidateQueries({ queryKey: ['system'] })
    },
  })
}

export function useAuthEvents() {
  return useQuery({ queryKey: ['auth', 'events'] as const, queryFn: () => listAuthEvents() })
}
