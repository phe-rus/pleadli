import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const existingOfficerSchema = z.object({
  id: z.string(),
  name: z.string(),
  rank: z.string().nullable(),
  badgeNumber: z.string().nullable(),
})

export const installationSchema = z.object({
  installed: z.boolean(),
  mode: z.enum(['station', 'command']).nullable(),
  commandLevel: z.string().nullable(),
  needsAdministrator: z.boolean(),
  authMode: z.enum(['badge_only', 'password']),
  name: z.string().nullable(),
  existingOfficers: z.array(existingOfficerSchema),
})

export type Installation = z.infer<typeof installationSchema>

export const actorSchema = z.object({
  officerId: z.string(),
  name: z.string(),
  rank: z.string().nullable(),
  badgeNumber: z.string().nullable(),
  role: z.string(),
})

export type Actor = z.infer<typeof actorSchema>

export const signInSchema = z.object({
  badgeNumber: z.string().min(1, { error: () => m["validation.enter_a_badge_number"]() }),
  password: z.string(),
})

export type SignInInput = z.infer<typeof signInSchema>

export const administratorSchema = z.object({
  existingOfficerId: z.string().nullable(),
  name: z.string(),
  rank: z.string(),
  badgeNumber: z.string().min(1, { error: () => m["validation.the_administrator_needs_a_badge_number"]() }),
  password: z.string(),
})

export type AdministratorInput = z.infer<typeof administratorSchema>

export const stationSetupSchema = z.object({
  stationName: z.string().min(1, { error: () => m["validation.the_station_needs_a_name"]() }),
  region: z.string(),
  district: z.string(),
  division: z.string(),
  administrator: administratorSchema,
})

export type StationSetupInput = z.infer<typeof stationSetupSchema>

export const commandLevels = [
  { value: 'region', get label() { return m["session.level.region"]() } },
  { value: 'district', get label() { return m["session.level.district"]() } },
  { value: 'headquarters', get label() { return m["session.level.headquarters"]() } },
] as const

export const commandSetupSchema = z.object({
  commandName: z.string().min(1, { error: () => m["validation.the_command_needs_a_name"]() }),
  level: z.string().min(1),
  administrator: administratorSchema,
})

export type CommandSetupInput = z.infer<typeof commandSetupSchema>

export const authPolicySchema = z.object({
  mode: z.enum(['badge_only', 'password']),
  idleTimeoutMinutes: z.number(),
  updatedAt: z.number().nullable(),
})

export type AuthPolicy = z.infer<typeof authPolicySchema>

export const authEventSchema = z.object({
  id: z.string(),
  badge: z.string().nullable(),
  name: z.string().nullable(),
  action: z.string(),
  detail: z.string().nullable(),
  occurredAt: z.number(),
})

export type AuthEvent = z.infer<typeof authEventSchema>

export function authEventLabel(action: string) {
  const label = (
    {
      sign_in: m["auth_event.sign_in"],
      sign_out: m["auth_event.sign_out"],
      sign_in_refused: m["auth_event.sign_in_refused"],
      policy_changed: m["auth_event.policy_changed"],
      installed: m["auth_event.installed"],
    } as Record<string, (() => string) | undefined>
  )[action]
  return label ? label() : action
}
