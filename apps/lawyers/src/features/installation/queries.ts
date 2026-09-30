import { findCountry } from '@pleadli/setup'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { getBrand, getInstallation, getSeals, getSessionStatus, getSetupStatus, getSignInPeople, listStaff, listUsages } from './data'

/** Polled, so an app that signed itself out while idle shows sign-in. */
export const sessionStatusOptions = () => queryOptions({ queryKey: ['session', 'status'] as const, queryFn: getSessionStatus, retry: false, staleTime: 0 })
export const useSessionStatus = () => useQuery({ ...sessionStatusOptions(), refetchInterval: 15_000, refetchOnWindowFocus: true })

/** The person acting, or null (before setup, or signed out). */
export function useActor() {
  const { data } = useSessionStatus()
  return data?.actor ?? null
}

/** Readable before anyone signs in, so sign-in and setup carry the practice's
 * logo and colour. */
export const brandOptions = () => queryOptions({ queryKey: ['installation', 'brand'] as const, queryFn: getBrand, staleTime: Infinity, retry: false })
export const useBrand = () => useQuery(brandOptions())

/** The country pack this practice works under. Undefined before setup. */
export function useJurisdiction() {
  const { data } = useBrand()
  return findCountry(data?.jurisdiction)
}

export const setupStatusOptions = () => queryOptions({ queryKey: ['installation', 'setup'] as const, queryFn: getSetupStatus, retry: false })
export const signInPeopleOptions = () => queryOptions({ queryKey: ['installation', 'sign-in-people'] as const, queryFn: getSignInPeople, retry: false, staleTime: 0 })
export const installationOptions = () => queryOptions({ queryKey: ['installation', 'record'] as const, queryFn: getInstallation })
export const staffOptions = () => queryOptions({ queryKey: ['installation', 'staff'] as const, queryFn: listStaff })
export const usagesOptions = () => queryOptions({ queryKey: ['installation', 'usages'] as const, queryFn: listUsages, staleTime: Infinity })
export const useUsagesEnabled = () => useQuery(usagesOptions())
export const sealsOptions = () => queryOptions({ queryKey: ['installation', 'seals'] as const, queryFn: getSeals })
