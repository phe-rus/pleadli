import { findCountry } from '@pleadli/setup'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { getBrand, getInstallation, getSetupStatus, getSignInPeople, listStaff } from './data'

/** Readable before anyone signs in, so the lock, sign-in and setup screens
 * carry the office's crest and colour. */
export const brandOptions = () => queryOptions({ queryKey: ['installation', 'brand'] as const, queryFn: getBrand, staleTime: Infinity, retry: false })
export const useBrand = () => useQuery(brandOptions())

/** The country pack this office works under: its reference numbers, file
 * order, courts, laws, time limits and decisions. Undefined before setup. */
export function useJurisdiction() {
  const { data } = useBrand()
  return findCountry(data?.jurisdiction)
}

export const setupStatusOptions = () => queryOptions({ queryKey: ['installation', 'setup'] as const, queryFn: getSetupStatus, retry: false })
export const signInPeopleOptions = () => queryOptions({ queryKey: ['installation', 'sign-in-people'] as const, queryFn: getSignInPeople, retry: false, staleTime: 0 })
export const installationOptions = () => queryOptions({ queryKey: ['installation', 'record'] as const, queryFn: getInstallation })
export const staffOptions = () => queryOptions({ queryKey: ['installation', 'staff'] as const, queryFn: listStaff })
