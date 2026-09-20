import { jurisdictionPack } from '@/features/jurisdiction'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { previewNumbering, setupFacility, setupHeadOffice } from './data'
import type { Draft } from './schema'

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/** The numbers a pattern would produce, or why it is refused. Waits for a
 * pause in typing so the node is asked once, not per keystroke. */
export function useNumberingPreview(pattern: string, reset: string, facilityNumber: string) {
  const key = useDebounced(JSON.stringify([pattern.trim(), reset, facilityNumber.trim()]), 300)
  const [debouncedPattern, debouncedReset, debouncedFacility] = JSON.parse(key) as [string, string, string]
  return useQuery({
    queryKey: ['onboarding', 'numberingPreview', debouncedPattern, debouncedReset, debouncedFacility] as const,
    queryFn: () => previewNumbering({ pattern: debouncedPattern, reset: debouncedReset, facilityNumber: debouncedFacility }),
    enabled: debouncedPattern.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: Infinity,
  })
}

export function useSetupFacility() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (draft: Draft) => setupFacility(draft, jurisdictionPack('ug')),
    // The system state now has a role and an account. The setup screens stay
    // up because the gate holds them until the officer finishes the last step.
    // The router tried its first route before anyone was signed in, so its
    // loaders run again now that there is a session (the sign-in gate does
    // this after a normal sign-in, but it is not on screen during setup).
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      await router.invalidate()
    },
  })
}

export function useSetupHeadOffice() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (draft: Draft) => setupHeadOffice(draft, jurisdictionPack('ug')),
    // Head Office has a role and an account now, so the router's first
    // attempt (made before anyone was signed in) is run again.
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      await router.invalidate()
    },
  })
}
