import * as z from 'zod'

export const brandSchema = z.object({
  installed: z.boolean(),
  officeName: z.string().nullable(),
  model: z.enum(['office', 'headquarters']).nullable(),
  jurisdiction: z.string().nullable(),
  language: z.string().nullable(),
  accent: z.string().nullable(),
  logo: z.string().nullable(),
})
export type Brand = z.infer<typeof brandSchema>

export const setupStatusSchema = z.object({
  installed: z.boolean(),
  existing: z.object({ name: z.string(), rank: z.string().nullable(), flag: z.boolean() }).nullable(),
})

export const enrolmentSchema = z.object({ secret: z.string(), uri: z.string(), svg: z.string() })

export const installationSchema = z.object({
  jurisdiction: z.string(),
  language: z.string(),
  model: z.enum(['office', 'headquarters']),
  officeName: z.string(),
  region: z.string().nullable(),
  protection: z.enum(['none', 'basic', 'full']),
  accent: z.string(),
  logo: z.string().nullable(),
  licenceVersion: z.string(),
  licenceAcceptedAt: z.number(),
  licenceAcceptedBy: z.string(),
  completedAt: z.number(),
  updatedAt: z.number(),
})
export type Installation = z.infer<typeof installationSchema>

export const staffRoles = ['administrator', 'prosecutor', 'clerk'] as const
export type StaffRole = (typeof staffRoles)[number]

export const staffSchema = z.object({
  id: z.string(),
  name: z.string(),
  rank: z.string().nullable(),
  role: z.enum(staffRoles),
  isDpp: z.boolean(),
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
