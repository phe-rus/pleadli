import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const authModes = ['password', 'pin', 'badge_only'] as const
export type AuthMode = (typeof authModes)[number]

export const authPolicySchema = z.object({
  mode: z.enum(authModes),
  idleTimeoutMinutes: z.number(),
  absoluteLifetimeHours: z.number(),
  updatedAt: z.number().nullable(),
})

export type AuthPolicy = z.infer<typeof authPolicySchema>
export type AuthPolicyInput = Pick<AuthPolicy, 'mode' | 'idleTimeoutMinutes' | 'absoluteLifetimeHours'>

export const authModeCopy: Record<AuthMode, { title: string; description: string }> = {
  password: {
    get title() { return m.auth_policy_password() },
    get description() { return m.auth_policy_every_officer_signs_in_with_their() },
  },
  pin: {
    get title() { return m.auth_policy_pin_or_password() },
    get description() { return m.auth_policy_officers_may_use_a_4_to() },
  },
  badge_only: {
    get title() { return m.auth_policy_badge_only_for_chosen_accounts() },
    get description() { return m.auth_policy_for_a_controlled_room_where_you() },
  },
}

export const idleOptions = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '480', label: '8 hours' },
] as const

export const lifetimeOptions = [
  { value: '8', label: '8 hours' },
  { value: '12', label: '12 hours' },
  { value: '24', label: '24 hours' },
] as const
