import * as z from 'zod'
import { officerSchema } from '@/features/officers/schema'

/** What the sign-in and onboarding screens need before anyone is signed in
 * (`GET /api/system/state`): the installation's role, whether it still needs
 * its first account, and whether a facility has paired. Nothing about records. */
export const systemStateSchema = z.object({
  isHeadOffice: z.boolean(),
  role: z.enum(['facility', 'head_office']).nullable(),
  activatedAt: z.number().nullable(),
  bootstrap: z.boolean(),
  paired: z.boolean(),
  connection: z.enum(['none', 'pending', 'connected', 'rejected', 'revoked']),
  /** How officers sign in here. Says nothing about any one account. */
  authMode: z.enum(['password', 'pin', 'badge_only']),
  apiLevel: z.number(),
})

export type SystemState = z.infer<typeof systemStateSchema>

/** Kept under its old name: the role part of the system state is what most
 * screens branch on. */
export const hqConfigSchema = systemStateSchema
export type HqConfig = SystemState

export const sessionSchema = z.object({
  officer: officerSchema,
  permissions: z.array(z.string()),
})

export type Session = z.infer<typeof sessionSchema>

export const signInResultSchema = sessionSchema.extend({
  token: z.string(),
  expiresAt: z.number(),
})

export type SignInResult = z.infer<typeof signInResultSchema>

export const signInSchema = z.object({
  badgeNumber: z.string().min(1, 'Badge number is required.'),
  password: z.string().min(1, 'Password is required.'),
})

export const bootstrapSchema = z.object({
  badgeNumber: z.string().min(1, 'Badge number is required.'),
  name: z.string().min(1, 'Name is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
})

export type BootstrapInput = z.infer<typeof bootstrapSchema>
