import { api } from '@/lib/api'
import type { SetupPayload, SignInAttempt } from '@pleadli/setup'
import * as z from 'zod'
import { brandSchema, enrolmentSchema, installationSchema, setupStatusSchema, signInPersonSchema, signInResultSchema, staffSchema, type StaffRole } from './schema'

export const getBrand = async () => brandSchema.parse(await api('GET', '/api/installation/brand'))
export const getSetupStatus = async () => setupStatusSchema.parse(await api('GET', '/api/setup/status'))
export const requestSecondFactor = async (name: string) => enrolmentSchema.parse(await api('POST', '/api/setup/second-factor', { body: { name } }))
export const completeSetup = (payload: SetupPayload) => api('POST', '/api/setup/complete', { body: payload })

export const getInstallation = async () => installationSchema.nullable().parse(await api('GET', '/api/installation'))
export type InstallationUpdate = { officeName: string; region: string | null; language: string; accent: string; logo: string | null }
export const updateInstallation = async (body: InstallationUpdate) => installationSchema.parse(await api('PUT', '/api/installation', { body }))
export const setProtection = (protection: string, secret: string | null) => api('PUT', '/api/installation/protection', { body: { protection, secret } })

export const getSignInPeople = async () => z.array(signInPersonSchema).parse(await api('GET', '/api/session/people'))
export const signIn = async (attempt: SignInAttempt) => signInResultSchema.parse(await api('POST', '/api/session/sign-in', { body: attempt }))
export const signOut = () => api('POST', '/api/session/sign-out')

export const listStaff = async () => z.array(staffSchema).parse(await api('GET', '/api/staff'))
export type NewStaff = { name: string; rank: string | null; role: StaffRole; isHead: boolean; secret: string | null }
export const createStaff = async (body: NewStaff) => staffSchema.parse(await api('POST', '/api/staff', { body }))
export type StaffUpdate = { name: string; rank: string | null; role: StaffRole; isHead: boolean; active: boolean }
export const updateStaff = async (id: string, body: StaffUpdate) => staffSchema.parse(await api('PUT', `/api/staff/${id}`, { body }))
export const setStaffSecret = (id: string, secret: string) => api('PUT', `/api/staff/${id}/secret`, { body: { secret } })
export const resetSecondFactor = (id: string) => api('DELETE', `/api/staff/${id}/second-factor`)

export const getSecurityStatus = async () =>
  z.object({ state: z.enum(['ready', 'recovery']), installed: z.boolean(), locked: z.boolean(), retryAfterSeconds: z.number(), reason: z.string().nullable() }).parse(await api('GET', '/api/security/status'))
