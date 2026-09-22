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
  badgeNumber: z.string().min(1, 'Enter a badge number.'),
  password: z.string(),
})

export type SignInInput = z.infer<typeof signInSchema>

export const administratorSchema = z.object({
  existingOfficerId: z.string().nullable(),
  name: z.string(),
  rank: z.string(),
  badgeNumber: z.string().min(1, 'The administrator needs a badge number.'),
  password: z.string(),
})

export type AdministratorInput = z.infer<typeof administratorSchema>

export const stationSetupSchema = z.object({
  stationName: z.string().min(1, 'The station needs a name.'),
  region: z.string(),
  district: z.string(),
  division: z.string(),
  administrator: administratorSchema,
})

export type StationSetupInput = z.infer<typeof stationSetupSchema>

export const commandLevels = [
  { value: 'region', label: 'Region' },
  { value: 'district', label: 'District' },
  { value: 'headquarters', label: 'Headquarters' },
] as const

export const commandSetupSchema = z.object({
  commandName: z.string().min(1, 'The command needs a name.'),
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
  return (
    {
      sign_in: 'Signed in',
      sign_out: 'Signed out',
      sign_in_refused: 'Sign-in refused',
      policy_changed: 'Sign-in policy changed',
      installed: 'Installation set up',
    }[action] ?? action
  )
}
