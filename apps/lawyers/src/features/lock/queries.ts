import { queryContext } from '@/lib/query-context/context'
import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import { disableLock, getLockStatus, lockNow, recoverPin, setupLock, unlock } from './data'
import type { DisableInput, RecoverInput, SetupInput, UnlockInput } from './schema'

export const lockStatusOptions = () => queryOptions({ queryKey: ['lock-status'] as const, queryFn: () => getLockStatus(), staleTime: 0 })
export const useLockStatus = () => useQuery(lockStatusOptions())

export const useSetupLock = () => useMutation({ mutationFn: (input: SetupInput) => setupLock(input) })
export const useUnlock = () => useMutation({ mutationFn: (input: UnlockInput) => unlock(input) })
export const useDisableLock = () => useMutation({ mutationFn: (input: DisableInput) => disableLock(input) })
export const useRecoverPin = () => useMutation({ mutationFn: (input: RecoverInput) => recoverPin(input) })

/** Locking clears everything already fetched, not just the lock status: data
 * read before the lock triggered must not sit readable in memory through
 * developer tools once the screen itself is gone. */
export const useLockNow = () =>
  useMutation({
    mutationFn: () => lockNow(),
    onSuccess: () => queryContext().clear(),
  })
