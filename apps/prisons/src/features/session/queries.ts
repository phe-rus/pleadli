import { getSessionToken, onSessionChange } from '@/lib/api'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { bootstrapFirstAccount, getSession, getSystemState, setDevRole, signIn, signOut } from './data'
import type { BootstrapInput } from './schema'

export function systemStateOptions() {
  return { queryKey: ['systemState'] as const, queryFn: () => getSystemState() }
}

export function useSystemState() {
  return useQuery(systemStateOptions())
}

/** The role of this installation. Same query as `useSystemState`; the name
 * is kept because most screens only branch on `isHeadOffice`. */
export const useHqConfig = useSystemState

export function useSessionToken() {
  return useSyncExternalStore(onSessionChange, getSessionToken, () => null)
}

/** The signed-in officer and what they may do. `null` when signed out. The
 * node answers 401 for a session it no longer accepts, which clears the
 * token and returns the app to the sign-in screen. */
export function useSession() {
  const token = useSessionToken()
  return useQuery({
    queryKey: ['session', token] as const,
    queryFn: () => getSession(),
    enabled: token != null,
    retry: false,
    staleTime: 30_000,
  })
}

/** UI courtesy only: the node enforces every permission on every request. */
export function usePermissions() {
  const { data: session } = useSession()
  const granted = new Set(session?.permissions ?? [])
  return { can: (permission: string) => granted.has(permission), session }
}

export function useSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ badgeNumber, password }: { badgeNumber: string; password: string }) => signIn(badgeNumber, password),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}

export function useBootstrapFirstAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BootstrapInput) => bootstrapFirstAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      queryClient.clear()
    },
  })
}

export function useSetDevRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (isHeadOffice: boolean) => setDevRole(isHeadOffice),
    onSuccess: (account) => {
      queryClient.clear()
      t.info('Role switched. Signed out.', { description: `Development account ${account.badgeNumber}, password ${account.password}.` })
    },
  })
}
