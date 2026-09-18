import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCurrentHqSession, getHqConfig, hqLogin, hqSignOut, setDevRole } from './data'

export function useHqConfig() {
  return useQuery({ queryKey: ['hqConfig'] as const, queryFn: () => getHqConfig() })
}

export function useCurrentHqSession(enabled: boolean) {
  return useQuery({ queryKey: ['hqSession'] as const, queryFn: () => getCurrentHqSession(), enabled })
}

export function useHqLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ badgeNumber, password }: { badgeNumber: string; password: string }) => hqLogin(badgeNumber, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hqSession'] })
    },
  })
}

export function useHqSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => hqSignOut(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hqSession'] })
    },
  })
}

export function useSetDevRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (isHeadOffice: boolean) => setDevRole(isHeadOffice),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hqConfig'] })
    },
  })
}
