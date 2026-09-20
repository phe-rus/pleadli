import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAuthPolicy, saveAuthPolicy } from './data'

export const authPolicyOptions = () => queryOptions({ queryKey: ['authPolicy'] as const, queryFn: () => getAuthPolicy() })

export function useAuthPolicy() {
  return useQuery(authPolicyOptions())
}

export function useSaveAuthPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveAuthPolicy,
    onSuccess: () => {
      // The sign-in screen reads the mode from the system state.
      queryClient.invalidateQueries({ queryKey: ['authPolicy'] })
      queryClient.invalidateQueries({ queryKey: ['systemState'] })
      queryClient.invalidateQueries({ queryKey: ['officers'] })
    },
  })
}
