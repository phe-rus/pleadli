import { useMutation, useQueryClient } from '@tanstack/react-query'
import { chooseRole, mintDevActivationCode, verifyActivationCode } from './data'
import type { HqRole } from './schema'

export function useChooseRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (role: HqRole) => chooseRole(role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemState'] })
    },
  })
}

export function useVerifyActivationCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => verifyActivationCode(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemState'] })
    },
  })
}

export function useMintDevActivationCode() {
  return useMutation({ mutationFn: () => mintDevActivationCode() })
}
