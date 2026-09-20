import { getSessionToken, onSessionChange } from '@/lib/api'
import { t } from '@pleadli/ui/goey-toaster'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { bootstrapFirstAccount, getSession, getSystemState, setDevRole, signIn, signOut } from './data'
import type { BootstrapInput } from './schema'
import { m } from '@/paraglide/messages'

export function systemStateOptions() {
  return {
    queryKey: ['systemState'] as const,
    queryFn: () => getSystemState(),
    // While the node does not answer (it restarts), ask again every few
    // seconds so the waiting screen gives way by itself.
    refetchInterval: (query: { state: { status: string } }) => (query.state.status === 'error' ? 3000 : false),
  }
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
export const sessionOptions = (token: string | null) => ({
  queryKey: ['session', token] as const,
  queryFn: () => getSession(),
  retry: false,
  staleTime: 30_000,
})

export function useSession() {
  const token = useSessionToken()
  return useQuery({ ...sessionOptions(token), enabled: token != null })
}

/** UI courtesy only: the node enforces every permission on every request. */
export function usePermissions() {
  const { data: session, isPending } = useSession()
  const granted = new Set(session?.permissions ?? [])
  return { can: (permission: string) => granted.has(permission), session, isPending }
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

/** Ending the session clears the cache itself: `signOut` drops the token and
 * the sign-in gate's session-change listener clears every query and reloads
 * the routes. Clearing again here, after the system state has already been
 * fetched for the sign-in screen, would wipe it and leave the screen blank. */
export function useSignOut() {
  return useMutation({ mutationFn: () => signOut() })
}

export function useSetDevRole() {
  return useMutation({
    mutationFn: (isHeadOffice: boolean) => setDevRole(isHeadOffice),
    // `setDevRole` drops the token, which clears the cache (see `useSignOut`).
    onSuccess: (account) => {
      t.info(m.session_role_switched_signed_out(), { description: m.session_development_account_password({ badgeNumber: account.badgeNumber, password: account.password }) })
    },
  })
}
