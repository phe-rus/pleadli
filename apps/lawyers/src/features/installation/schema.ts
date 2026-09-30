import * as z from 'zod'

export const settings = ['alone', 'firm'] as const
export type Setting = (typeof settings)[number]

/** Private practice, a government legal office, a company's own legal
 * department, a legal aid provider. */
export const practiceKinds = ['private', 'government', 'in_house', 'legal_aid'] as const
export type PracticeKind = (typeof practiceKinds)[number]

export const staffRoles = ['advocate', 'paralegal', 'accounts'] as const
export type StaffRole = (typeof staffRoles)[number]

export const brandSchema = z.object({
  installed: z.boolean(),
  officeName: z.string().nullable(),
  setting: z.enum(settings).nullable(),
  jurisdiction: z.string().nullable(),
  language: z.string().nullable(),
  accent: z.string().nullable(),
  logo: z.string().nullable(),
})
export type Brand = z.infer<typeof brandSchema>

export const setupStatusSchema = z.object({
  installed: z.boolean(),
  existing: z.object({ name: z.string(), rank: z.string().nullable(), flag: z.boolean() }).nullable(),
  existingFirm: z.string().nullable(),
  hasMatters: z.boolean(),
})
export type SetupStatus = z.infer<typeof setupStatusSchema>

export const enrolmentSchema = z.object({ secret: z.string(), uri: z.string(), svg: z.string() })

export const actorSchema = z.object({ id: z.string(), name: z.string(), title: z.string().nullable(), role: z.enum(staffRoles), isAdmin: z.boolean() })
export type Actor = z.infer<typeof actorSchema>

export const sessionStatusSchema = z.object({
  state: z.enum(['ready', 'recovery']),
  installed: z.boolean(),
  level: z.enum(['none', 'basic', 'full']).nullable(),
  locked: z.boolean(),
  /** Before setup: the old PIN lock is on and closed. */
  legacyLocked: z.boolean(),
  actor: actorSchema.nullable(),
  idleMinutes: z.number(),
  retryAfterSeconds: z.number(),
  reason: z.string().nullable(),
})
export type SessionStatus = z.infer<typeof sessionStatusSchema>

export const installationSchema = z.object({
  jurisdiction: z.string(),
  language: z.string(),
  setting: z.enum(settings),
  practiceKind: z.enum(practiceKinds),
  officeName: z.string(),
  region: z.string().nullable(),
  protection: z.enum(['none', 'basic', 'full']),
  accent: z.string(),
  logo: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  hourlyRate: z.number().nullable(),
  licenceVersion: z.string(),
  licenceAcceptedAt: z.number(),
  licenceAcceptedBy: z.string(),
  completedAt: z.number(),
  updatedAt: z.number(),
})
export type Installation = z.infer<typeof installationSchema>

export const staffSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  role: z.enum(staffRoles),
  isAdmin: z.boolean(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  practisingNumber: z.string().nullable(),
  certificateExpiresOn: z.number().nullable(),
  secretKind: z.enum(['pin', 'password']).nullable(),
  hasSecondFactor: z.boolean(),
  active: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Staff = z.infer<typeof staffSchema>

export const signInPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  rank: z.string().nullable(),
  secretKind: z.enum(['pin', 'password']),
  needsEnrolment: z.boolean(),
})

export const signInResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('signed_in') }),
  z.object({ status: z.literal('code') }),
  z.object({ status: z.literal('enrol'), enrolment: enrolmentSchema }),
])
