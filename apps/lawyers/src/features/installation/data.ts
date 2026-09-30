import { api, seg } from '@/lib/api'
import type { SetupPayload, SignInAttempt } from '@pleadli/setup'
import * as z from 'zod'
import type { Usage } from '@/features/usages'
import {
  brandSchema,
  enrolmentSchema,
  installationSchema,
  sessionStatusSchema,
  setupStatusSchema,
  signInPersonSchema,
  signInResultSchema,
  staffSchema,
  type PracticeKind,
  type Setting,
  type StaffRole,
} from './schema'

export const getSessionStatus = async () => sessionStatusSchema.parse(await api('GET', '/api/session/status'))
export const getBrand = async () => brandSchema.parse(await api('GET', '/api/installation/brand'))
export const getSetupStatus = async () => setupStatusSchema.parse(await api('GET', '/api/setup/status'))
export const requestSecondFactor = async (name: string) => enrolmentSchema.parse(await api('POST', '/api/setup/second-factor', { body: { name } }))
export const completeSetup = (payload: SetupPayload) => api('POST', '/api/setup/complete', { body: payload })

export const getInstallation = async () => installationSchema.nullable().parse(await api('GET', '/api/installation'))
export type InstallationUpdate = {
  officeName: string
  region: string | null
  language: string
  accent: string
  logo: string | null
  setting: Setting
  practiceKind: PracticeKind
}
export const updateInstallation = async (body: InstallationUpdate) => installationSchema.parse(await api('PUT', '/api/installation', { body }))
/** Development builds only: the API refuses it in a release. */
export const setJurisdiction = async (jurisdiction: string, region: string | null) =>
  installationSchema.parse(await api('PUT', '/api/installation/jurisdiction', { body: { jurisdiction, region } }))
export const setProtection = async (protection: string, secret: string | null) =>
  sessionStatusSchema.parse(await api('PUT', '/api/installation/protection', { body: { protection, secret } }))
export const setIdleMinutes = async (minutes: number) => sessionStatusSchema.parse(await api('PUT', '/api/installation/idle', { body: { minutes } }))

export const getSignInPeople = async () => z.array(signInPersonSchema).parse(await api('GET', '/api/session/people'))
export const signIn = async (attempt: SignInAttempt) => signInResultSchema.parse(await api('POST', '/api/session/sign-in', { body: attempt }))
export const signOut = () => api('POST', '/api/session/sign-out')

export const listStaff = async () => z.array(staffSchema).parse(await api('GET', '/api/staff'))
export type NewStaff = { name: string; title: string | null; role: StaffRole; isAdmin: boolean; phone: string | null; email: string | null; secret: string | null }
export const createStaff = async (body: NewStaff) => staffSchema.parse(await api('POST', '/api/staff', { body }))
export type StaffUpdate = {
  name: string
  title: string | null
  role: StaffRole
  isAdmin: boolean
  phone: string | null
  email: string | null
  practisingNumber: string | null
  certificateExpiresOn: number | null
  active: boolean
}
export const updateStaff = async (id: string, body: StaffUpdate) => staffSchema.parse(await api('PUT', `/api/staff/${seg(id)}`, { body }))
export const setStaffSecret = (id: string, secret: string) => api('PUT', `/api/staff/${seg(id)}/secret`, { body: { secret } })
export const resetSecondFactor = (id: string) => api('DELETE', `/api/staff/${seg(id)}/second-factor`)

export const listUsages = async () => z.array(z.string()).parse(await api('GET', '/api/usages')) as Usage[]
export const setUsages = async (usages: readonly Usage[]) => z.array(z.string()).parse(await api('PUT', '/api/usages', { body: { usages } })) as Usage[]

export const setContacts = async (body: { address: string | null; phone: string | null; email: string | null }) =>
  installationSchema.parse(await api('PUT', '/api/installation/contacts', { body }))

export const getSeals = async () => z.object({ signature: z.string().nullable(), stamp: z.string().nullable() }).parse(await api('GET', '/api/seals'))
export const setSignature = (image: string | null) => api('PUT', '/api/seals/signature', { body: { image } })
export const setStamp = (image: string | null) => api('PUT', '/api/seals/stamp', { body: { image } })
